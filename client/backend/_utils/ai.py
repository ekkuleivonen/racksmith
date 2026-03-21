"""PydanticAI agents, tool definitions, and model configuration."""

from __future__ import annotations

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

import settings
from _utils.agent_stream import AgentDeps
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
# Agent definitions
# ---------------------------------------------------------------------------

role_agent: Agent[AgentDeps, RoleCreate] = Agent(
    output_type=RoleCreate,
    retries=2,
    tools=[list_roles, get_role_detail, update_role],
)

playbook_agent: Agent[AgentDeps, str] = Agent(
    output_type=str,
    retries=2,
    tools=[
        list_roles,
        get_role_detail,
        create_role,
        update_role,
        create_playbook,
        get_playbook,
        update_playbook,
    ],
)
