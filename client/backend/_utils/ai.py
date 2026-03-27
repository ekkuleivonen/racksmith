"""PydanticAI agents, tool definitions, and model configuration."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import redis.asyncio as aioredis
from pydantic_ai import Agent, ApprovalRequired, RunContext
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from racksmith_shared.runs import run_events_channel

import settings
from _utils.agent_stream import AgentDeps
from _utils.exceptions import AlreadyExistsError, NotFoundError, RepoNotAvailableError
from groups.schemas import GroupCreate, GroupUpdate
from hosts.schemas import HostCreate, HostUpdate
from playbooks.schemas import PlaybookCreate, PlaybookUpdate
from roles.schemas import RoleCreate


def get_model() -> OpenAIModel:
    """Build an OpenAIModel from current settings (called per-request)."""
    provider = OpenAIProvider(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
    )
    return OpenAIModel(settings.OPENAI_MODEL, provider=provider)


# ---------------------------------------------------------------------------
# Tool implementations (shared across agents via the `tools` parameter)
# ---------------------------------------------------------------------------


async def list_roles(ctx: RunContext[AgentDeps]) -> str:
    """List all existing Ansible roles in the repository. Returns a compact summary of each role including its id, name, inputs, and outputs."""
    from roles.managers import role_manager

    roles = role_manager.list_roles(ctx.deps.session)
    if not roles:
        return "No roles found in the repository."
    lines: list[str] = []
    for r in roles:
        inputs_desc = ", ".join(f"{i.key}({i.type})" for i in r.inputs) or "none"
        outputs_desc = ", ".join(o.key for o in r.outputs) or "none"
        lines.append(
            f"- id={r.id} | {r.name} | inputs=[{inputs_desc}] | outputs=[{outputs_desc}]\n"
            f"  {r.description[:150]}"
        )
    return f"Found {len(roles)} roles:\n" + "\n".join(lines)


async def get_role_detail(ctx: RunContext[AgentDeps], role_id: str) -> str:
    """Get the full YAML definition of a role by its ID. Use this to inspect tasks, inputs, outputs, and metadata before deciding to reuse a role."""
    from roles.managers import role_manager

    try:
        detail = role_manager.get_role_detail(ctx.deps.session, role_id)
    except FileNotFoundError:
        return f"Role '{role_id}' not found."
    return f"Role '{detail.name}' (id: {detail.id}):\n\n{detail.raw_content}"


async def create_role(ctx: RunContext[AgentDeps], role: RoleCreate) -> str:
    """Create a new Ansible role and persist it to disk. Provide the complete role definition including name, description, inputs, outputs, and tasks."""
    from roles.managers import role_manager

    summary = role_manager.create_role(ctx.deps.session, role)
    return f"Created role '{summary.name}' (id: {summary.id})"


async def update_role(ctx: RunContext[AgentDeps], role_id: str, role: RoleCreate) -> str:
    """Update an existing role in-place. Provide the role_id and the complete updated role definition. Use this instead of create_role when modifying an existing role."""
    import yaml as _yaml

    from roles.managers import role_manager
    from roles.schemas import RoleUpdate

    yaml_text = _yaml.safe_dump(
        role.model_dump(exclude_defaults=True),
        sort_keys=False,
    )
    detail = role_manager.update_role(
        ctx.deps.session, role_id, RoleUpdate(yaml_text=yaml_text)
    )
    return f"Updated role '{detail.name}' (id: {detail.id})"


async def create_playbook(ctx: RunContext[AgentDeps], playbook: PlaybookCreate) -> str:
    """Assemble and save a playbook from existing roles. Each entry in the roles list must reference a role_id that already exists. Use vars to pass input values to each role. Roles execute in the order listed."""
    from playbooks.managers import playbook_manager

    detail = playbook_manager.create_playbook(ctx.deps.session, playbook)
    ctx.deps.created_playbook_id = detail.id
    return (
        f"Created playbook '{detail.name}' (id: {detail.id}) "
        f"with {len(detail.roles)} role(s)."
    )


async def get_playbook(ctx: RunContext[AgentDeps], playbook_id: str) -> str:
    """Get the current definition of a playbook by its ID, including name, description, become flag, and the list of role entries with their vars."""
    from playbooks.managers import playbook_manager

    try:
        detail = playbook_manager.get_playbook(ctx.deps.session, playbook_id)
    except FileNotFoundError:
        return f"Playbook '{playbook_id}' not found."
    import json

    return json.dumps(
        {
            "id": detail.id,
            "name": detail.name,
            "description": detail.description,
            "become": detail.become,
            "roles": [re.model_dump() for re in detail.role_entries],
        },
        indent=2,
    )


async def run_ssh_command(ctx: RunContext[AgentDeps], host_id: str, command: str) -> str:
    """Run a shell command on a host via SSH. You must pass the host_id of a managed host with SSH credentials."""
    from daemon.client import daemon_post
    from hosts.managers import host_manager

    try:
        h = host_manager.get_host(ctx.deps.session, host_id)
    except NotFoundError:
        return f"Host {host_id!r} not found."
    if not h.managed:
        return f"Host {host_id!r} is not managed — cannot SSH."
    ip = (h.ip_address or "").strip()
    ssh_user = (h.ssh_user or "").strip()
    if not ip or not ssh_user:
        return f"Host {host_id!r} is missing ip_address or ssh_user."
    ssh_port = int(h.ssh_port or 22)
    try:
        result = await daemon_post(
            "/ssh/exec",
            {
                "ip": ip,
                "ssh_user": ssh_user,
                "ssh_port": ssh_port,
                "command": command,
            },
            timeout=120.0,
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        return f"SSH exec request failed (HTTP {exc.response.status_code}): {detail}"

    exit_code = result.get("exit_code")
    stdout = result.get("stdout") or ""
    stderr = result.get("stderr") or ""
    return (
        f"exit_code={exit_code}\n--- stdout ---\n{stdout}\n--- stderr ---\n{stderr}"
    )


async def update_playbook(
    ctx: RunContext[AgentDeps], playbook_id: str, playbook: PlaybookCreate
) -> str:
    """Update an existing playbook. Provide the playbook_id and the full updated playbook definition (name, description, roles, become). All role_ids referenced must already exist."""
    from playbooks.managers import playbook_manager

    body = PlaybookUpdate(
        name=playbook.name,
        description=playbook.description,
        become=playbook.become,
        roles=playbook.roles,
    )
    detail = playbook_manager.update_playbook(
        ctx.deps.session, playbook_id, body
    )
    ctx.deps.updated_playbook_id = detail.id
    return (
        f"Updated playbook '{detail.name}' (id: {detail.id}) "
        f"with {len(detail.roles)} role(s)."
    )


# ---------------------------------------------------------------------------
# Run helpers
# ---------------------------------------------------------------------------

_RUN_TIMEOUT = 300  # 5 minutes
_OUTPUT_TAIL = 8000



async def _wait_for_run(
    run_id: str,
    load_run_fn: Any,
    *,
    output_sink: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    tool_name: str = "",
) -> str:
    """Subscribe to Redis pub/sub, wait for run completion, return formatted output."""
    channel = run_events_channel(run_id)
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()

    try:
        await pubsub.subscribe(channel)
        loop = asyncio.get_event_loop()
        deadline = loop.time() + _RUN_TIMEOUT

        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                return f"Run {run_id} timed out after {_RUN_TIMEOUT}s."

            msg = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=min(5.0, remaining)
            )
            if msg is None:
                run = await load_run_fn(run_id)
                if run and run.status in ("completed", "failed"):
                    break
                continue
            if msg["type"] != "message":
                continue
            payload = json.loads(msg["data"])
            if payload.get("type") == "output" and output_sink:
                chunk = payload.get("data", "")
                if isinstance(chunk, str) and chunk:
                    await output_sink(
                        {
                            "type": "run_output",
                            "run_id": run_id,
                            "tool": tool_name,
                            "chunk": chunk,
                        }
                    )
            if payload.get("type") == "done":
                break
    finally:
        await pubsub.unsubscribe(channel)
        await redis_client.aclose()

    run = await load_run_fn(run_id)
    if run is None:
        return f"Run {run_id} not found after completion."

    output = run.output or ""
    if len(output) > _OUTPUT_TAIL:
        output = "…(truncated)\n" + output[-_OUTPUT_TAIL:]

    return (
        f"run_id={run.id} status={run.status} exit_code={run.exit_code}\n"
        f"--- output ---\n{output}"
    )


async def run_playbook(
    ctx: RunContext[AgentDeps],
    playbook_id: str,
    host_ids: list[str],
    runtime_vars: dict[str, str] | None = None,
) -> str:
    """Run a playbook on the given hosts and wait for completion. You must pass host_ids explicitly."""
    from playbooks.managers import playbook_manager
    from playbooks.schemas import PlaybookRunRequest, TargetSelection

    if not host_ids:
        return "Cannot run playbook: host_ids is required and must not be empty."

    try:
        detail = playbook_manager.get_playbook(ctx.deps.session, playbook_id)
    except FileNotFoundError:
        return f"Playbook '{playbook_id}' not found."

    merged_runtime = dict(runtime_vars or {})
    if ctx.deps.resume_runtime_vars:
        merged_runtime.update(ctx.deps.resume_runtime_vars)
    become_pw = (ctx.deps.become_password or "").strip() or None

    if not ctx.tool_call_approved:
        fields: list[dict[str, Any]] = []

        if detail.become and not become_pw:
            fields.append(
                {
                    "key": "become_password",
                    "label": "Sudo password",
                    "type": "password",
                    "required": True,
                }
            )

        req_vars = playbook_manager.get_required_runtime_vars(
            ctx.deps.session, playbook_id
        )
        for entry in req_vars.inputs:
            if entry.secret:
                merged_runtime.pop(entry.key, None)
            elif entry.key in merged_runtime:
                continue
            fields.append(
                {
                    "key": entry.key,
                    "label": entry.label,
                    "type": "password" if entry.secret else "text",
                    "required": entry.required,
                }
            )

        if fields:
            raise ApprovalRequired(metadata={"fields": fields})

    body = PlaybookRunRequest(
        targets=TargetSelection(hosts=list(host_ids)),
        runtime_vars=merged_runtime,
        become_password=become_pw if detail.become else None,
    )
    run = await playbook_manager.create_run(ctx.deps.session, playbook_id, body)
    return await _wait_for_run(
        run.id,
        playbook_manager.load_playbook_run,
        output_sink=ctx.deps.run_output_sink,
        tool_name="run_playbook",
    )


async def run_role(
    ctx: RunContext[AgentDeps],
    role_id: str,
    host_ids: list[str],
    vars: dict[str, str] | None = None,
    become: bool = False,
) -> str:
    """Run a single role on the given hosts and wait for completion. You must pass host_ids explicitly."""
    from playbooks.schemas import TargetSelection
    from roles.managers import role_manager
    from roles.schemas import RoleRunRequest

    if not host_ids:
        return "Cannot run role: host_ids is required and must not be empty."

    merged_vars = dict(vars or {})
    merged_runtime = dict(ctx.deps.resume_runtime_vars or {})
    merged_vars.update(merged_runtime)
    become_pw = (ctx.deps.become_password or "").strip() or None

    if not ctx.tool_call_approved:
        fields: list[dict[str, Any]] = []

        if become and not become_pw:
            fields.append(
                {
                    "key": "become_password",
                    "label": "Sudo password",
                    "type": "password",
                    "required": True,
                }
            )

        try:
            role_detail = role_manager.get_role(ctx.deps.session, role_id)
            for inp in role_detail.inputs:
                t = (inp.type or "string").lower()
                is_secret = bool(inp.secret) or t == "secret"
                if not inp.runtime and not is_secret:
                    continue
                if is_secret:
                    merged_vars.pop(inp.key, None)
                elif inp.key in merged_vars:
                    continue
                fields.append(
                    {
                        "key": inp.key,
                        "label": inp.label or inp.key,
                        "type": "password" if is_secret else "text",
                        "required": inp.required,
                    }
                )
        except (FileNotFoundError, NotFoundError):
            pass

        if fields:
            raise ApprovalRequired(metadata={"fields": fields})

    body = RoleRunRequest(
        targets=TargetSelection(hosts=list(host_ids)),
        vars=vars or {},
        become=become,
        become_password=become_pw if become else None,
        runtime_vars=merged_runtime,
    )
    run = await role_manager.create_run(ctx.deps.session, role_id, body)
    return await _wait_for_run(
        run.id,
        role_manager._load_run,
        output_sink=ctx.deps.run_output_sink,
        tool_name="run_role",
    )


# ---------------------------------------------------------------------------
# Host & group tools
# ---------------------------------------------------------------------------


def _repo_err(exc: Exception) -> str:
    if isinstance(exc, RepoNotAvailableError):
        return "No active repository or Ansible layout is not available."
    if isinstance(exc, NotFoundError):
        return str(exc)
    if isinstance(exc, AlreadyExistsError):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        return str(exc)
    if isinstance(exc, ValueError):
        return str(exc)
    return f"Error: {exc!s}"


async def list_hosts(ctx: RunContext[AgentDeps]) -> str:
    """List all hosts (managed inventory + rack nodes) in the active repo: id, name, IP, managed flag, groups."""
    from hosts.managers import host_manager

    try:
        hosts = host_manager.list_hosts(ctx.deps.session)
    except RepoNotAvailableError as exc:
        return _repo_err(exc)
    if not hosts:
        return "No hosts in the repository."
    lines: list[str] = []
    for h in hosts:
        lines.append(
            f"- id={h.id} | name={h.name!r} | ip={h.ip_address!r} | "
            f"managed={h.managed} | groups={h.groups} | labels={h.labels}"
        )
    return f"{len(hosts)} host(s):\n" + "\n".join(lines)


async def get_host(ctx: RunContext[AgentDeps], host_id: str) -> str:
    """Get full JSON for one host by id (connection info, groups, labels, placement, vars)."""
    from hosts.managers import host_manager

    try:
        h = host_manager.get_host(ctx.deps.session, host_id)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return json.dumps(h.model_dump(), indent=2)


async def create_host(ctx: RunContext[AgentDeps], host: HostCreate) -> str:
    """Create a host (managed SSH target or unmanaged rack placement). Probes SSH when managed with IP and user."""
    from hosts.managers import host_manager

    try:
        h = await host_manager.create_host(ctx.deps.session, host)
    except (RepoNotAvailableError, ValueError) as exc:
        return _repo_err(exc)
    return json.dumps({"created": h.model_dump()}, indent=2)


async def update_host(
    ctx: RunContext[AgentDeps], host_id: str, update: HostUpdate
) -> str:
    """Patch an existing host. Only set fields you intend to change."""
    from hosts.managers import host_manager

    try:
        h = host_manager.update_host(ctx.deps.session, host_id, update)
    except (NotFoundError, RepoNotAvailableError, ValueError) as exc:
        return _repo_err(exc)
    return json.dumps({"updated": h.model_dump()}, indent=2)


async def delete_host(ctx: RunContext[AgentDeps], host_id: str) -> str:
    """Remove a host from inventory and/or rack nodes."""
    from hosts.managers import host_manager

    try:
        host_manager.delete_host(ctx.deps.session, host_id)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return f"Deleted host {host_id!r}."


async def probe_managed_host(ctx: RunContext[AgentDeps], host_id: str) -> str:
    """Re-run SSH probe on a managed host to refresh hostname, OS family, etc."""
    from hosts.managers import host_manager

    try:
        h = await host_manager.probe_host(ctx.deps.session, host_id)
    except (NotFoundError, RepoNotAvailableError, ValueError) as exc:
        return _repo_err(exc)
    return json.dumps({"probed": h.model_dump()}, indent=2)


async def list_groups(ctx: RunContext[AgentDeps]) -> str:
    """List all host groups in the active repo (id, name, description)."""
    from groups.managers import group_manager

    try:
        groups = group_manager.list_groups(ctx.deps.session)
    except RepoNotAvailableError as exc:
        return _repo_err(exc)
    if not groups:
        return "No groups in the repository."
    lines = [f"- id={g.id} | name={g.name!r} | {g.description[:120]}" for g in groups]
    return f"{len(groups)} group(s):\n" + "\n".join(lines)


async def get_group(ctx: RunContext[AgentDeps], group_id: str) -> str:
    """Get one group by id as JSON, including member host summaries."""
    from groups.managers import group_manager

    try:
        g = group_manager.get_group(ctx.deps.session, group_id)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return json.dumps(g.model_dump(), indent=2)


async def create_group(ctx: RunContext[AgentDeps], body: GroupCreate) -> str:
    """Create a new inventory group (name, optional description and group_vars)."""
    from groups.managers import group_manager

    try:
        g = group_manager.create_group(ctx.deps.session, body)
    except (AlreadyExistsError, RepoNotAvailableError, FileNotFoundError) as exc:
        return _repo_err(exc)
    return json.dumps({"created": g.model_dump()}, indent=2)


async def update_group(
    ctx: RunContext[AgentDeps], group_id: str, body: GroupUpdate
) -> str:
    """Update group display name, description, and/or Ansible vars."""
    from groups.managers import group_manager

    try:
        g = group_manager.update_group(ctx.deps.session, group_id, body)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return json.dumps({"updated": g.model_dump()}, indent=2)


async def delete_group(ctx: RunContext[AgentDeps], group_id: str) -> str:
    """Delete a group from inventory (does not delete member hosts)."""
    from groups.managers import group_manager

    try:
        group_manager.delete_group(ctx.deps.session, group_id)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return f"Deleted group {group_id!r}."


async def add_hosts_to_group(
    ctx: RunContext[AgentDeps], group_id: str, host_ids: list[str]
) -> str:
    """Add one or more inventory hosts to a group (skips unknown host ids)."""
    from groups.managers import group_manager

    try:
        group_manager.add_members(ctx.deps.session, group_id, host_ids)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return f"Added {len(host_ids)} host id(s) to group {group_id!r} (existing members unchanged)."


async def remove_host_from_group(
    ctx: RunContext[AgentDeps], group_id: str, host_id: str
) -> str:
    """Remove a host from a group."""
    from groups.managers import group_manager

    try:
        group_manager.remove_member(ctx.deps.session, group_id, host_id)
    except (NotFoundError, RepoNotAvailableError) as exc:
        return _repo_err(exc)
    return f"Removed host {host_id!r} from group {group_id!r}."


# ---------------------------------------------------------------------------
# Delete tools
# ---------------------------------------------------------------------------


async def delete_role(ctx: RunContext[AgentDeps], role_id: str) -> str:
    """Permanently delete a role directory from the repo. Fails if the role is still referenced by playbooks."""
    from roles.managers import role_manager

    try:
        role_manager.delete_role(ctx.deps.session, role_id)
    except FileNotFoundError:
        return f"Role {role_id!r} not found."
    except (RepoNotAvailableError, ValueError) as exc:
        return _repo_err(exc)
    return f"Deleted role {role_id!r}."


async def delete_playbook(
    ctx: RunContext[AgentDeps], playbook_id: str, cascade_roles: bool = False
) -> str:
    """Delete a playbook file. If cascade_roles is true, also delete roles only used by this playbook."""
    from playbooks.managers import playbook_manager

    try:
        playbook_manager.delete_playbook(
            ctx.deps.session, playbook_id, cascade_roles=cascade_roles
        )
    except RepoNotAvailableError as exc:
        return _repo_err(exc)
    return f"Deleted playbook {playbook_id!r}" + (
        " and orphaned roles." if cascade_roles else "."
    )


# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

role_agent: Agent[AgentDeps, RoleCreate] = Agent(
    output_type=RoleCreate,
    retries=2,
    tools=[list_roles, get_role_detail, update_role, delete_role],
)

playbook_agent: Agent[AgentDeps, str] = Agent(
    output_type=str,
    retries=2,
    tools=[
        list_roles,
        get_role_detail,
        create_role,
        update_role,
        delete_role,
        create_playbook,
        get_playbook,
        update_playbook,
        delete_playbook,
        list_hosts,
        get_host,
        create_host,
        update_host,
        delete_host,
        probe_managed_host,
        list_groups,
        get_group,
        create_group,
        update_group,
        delete_group,
        add_hosts_to_group,
        remove_host_from_group,
        run_ssh_command,
        run_playbook,
        run_role,
    ],
)

# Unified chat uses the same tool surface as playbook assembly (full Racksmith repo + optional SSH).
racksmith_agent = playbook_agent

RACKSMITH_CHAT_INSTRUCTIONS = """Racksmith AI: help with infra here—Ansible roles/playbooks in the active Git repo, managed hosts and groups, runs, and racks. You can list/create/update/delete hosts and groups, delete roles or playbooks when appropriate, and use the other tools as needed.

EXPLICIT HOST TARGETING — every tool that touches hosts requires explicit IDs:
  - `run_ssh_command(host_id, command)` — pass the host_id you want to SSH into.
  - `run_playbook(playbook_id, host_ids, ...)` — pass the list of target host IDs.
  - `run_role(role_id, host_ids, ...)` — pass the list of target host IDs.
None of these tools have fallback behaviour. If you don't pass the IDs, they fail.
When the user names specific hosts, resolve their IDs (via list_hosts / get_host)
and pass them. Always confirm which hosts you will target before executing a run.

RUNTIME INPUTS — roles may mark inputs as runtime (collected per run) or secret (sensitive).
- Secret inputs (passwords, tokens, API keys): NEVER put these in vars/runtime_vars. The
  system always pauses and prompts the user through the UI; agent-supplied values are ignored.
- Non-secret runtime inputs (environment name, deploy tag, branch, etc.): you MAY supply
  them via the vars or runtime_vars argument when the user gave them or you can infer them.
  If you omit them, the user is prompted.
Always call run_role / run_playbook with playbook or role ID and host IDs. NEVER refuse
because of missing runtime inputs — proceed and let the input-prompt flow handle gaps.

Stay dry and technical—no filler or buddy chat. Act as a mentor: be direct and precise, and push back when you see logical slips, weak reasoning, or bad technical assumptions (say what is wrong and why)."""

debug_run_agent: Agent[AgentDeps, str] = Agent(
    output_type=str,
    retries=2,
    tools=[
        run_ssh_command,
        get_role_detail,
        update_role,
        delete_role,
        get_playbook,
        update_playbook,
        delete_playbook,
        run_playbook,
        run_role,
        list_hosts,
        get_host,
        create_host,
        update_host,
        delete_host,
        probe_managed_host,
        list_groups,
        get_group,
        create_group,
        update_group,
        delete_group,
        add_hosts_to_group,
        remove_host_from_group,
    ],
)
