"""Resolve @-style context attachments into AgentDeps and optional user-message prefix."""

from __future__ import annotations

from dataclasses import dataclass

from _utils.agent_stream import AgentDeps
from _utils.exceptions import NotFoundError
from auth.session import SessionData
from hosts.managers import host_manager
from hosts.schemas import Host
from playbooks.managers import playbook_manager
from roles.managers import role_manager


@dataclass
class ChatAttachmentContext:
    """Parsed attachment ids from the client (all optional)."""

    host_ids: list[str]
    playbook_ids: list[str]
    role_ids: list[str]
    run_ids: list[str]
    rack_ids: list[str]


async def build_agent_deps_and_prefix(
    session: SessionData,
    ctx: ChatAttachmentContext,
) -> tuple[AgentDeps, str]:
    """Return deps (SSH from first eligible host or first run's target) and a text prefix for the user turn."""
    prefix_lines: list[str] = []
    ssh_host: Host | None = None

    for hid in ctx.host_ids:
        hid = (hid or "").strip()
        if not hid:
            continue
        try:
            h = host_manager.get_host(session, hid)
        except NotFoundError:
            raise ValueError(f"Host not found: {hid}") from None
        prefix_lines.append(
            f"[Attached host id={h.id} name={h.name or h.id} ip={h.ip_address or 'n/a'} managed={h.managed}]"
        )
        if ssh_host is None and h.managed and (h.ip_address or "").strip() and (h.ssh_user or "").strip():
            ssh_host = h

    for pid in ctx.playbook_ids:
        pid = (pid or "").strip()
        if not pid:
            continue
        try:
            pb = playbook_manager.get_playbook(session, pid)
        except FileNotFoundError:
            raise ValueError(f"Playbook not found: {pid}") from None
        prefix_lines.append(
            f"[Attached playbook id={pb.id} name={pb.name} become={pb.become} roles={len(pb.role_entries)}]"
        )

    for rid in ctx.role_ids:
        rid = (rid or "").strip()
        if not rid:
            continue
        try:
            detail = role_manager.get_role_detail(session, rid)
        except FileNotFoundError:
            raise ValueError(f"Role not found: {rid}") from None
        prefix_lines.append(f"[Attached role id={detail.id} name={detail.name}]")

    for run_id in ctx.run_ids:
        run_id = (run_id or "").strip()
        if not run_id:
            continue
        run = await playbook_manager.load_playbook_run(run_id)
        if run is None:
            raise ValueError(f"Run not found: {run_id}")
        prefix_lines.append(
            f"[Attached playbook run id={run.id} playbook_id={run.playbook_id} status={run.status} hosts={run.hosts}]"
        )
        out = run.output or ""
        if len(out) > 8000:
            out = "…\n" + out[-8000:]
        prefix_lines.append(f"[Run output]\n{out}")
        if ssh_host is None and run.hosts:
            try:
                h = host_manager.get_host(session, run.hosts[0])
            except NotFoundError:
                pass
            else:
                if h.managed and (h.ip_address or "").strip() and (h.ssh_user or "").strip():
                    ssh_host = h

    for rack_id in ctx.rack_ids:
        rack_id = (rack_id or "").strip()
        if not rack_id:
            continue
        prefix_lines.append(f"[Attached rack id={rack_id} — use rack APIs if you need layout details.]")

    deps = AgentDeps(session=session)
    if ssh_host is not None:
        deps.host_ip = (ssh_host.ip_address or "").strip()
        deps.host_ssh_user = (ssh_host.ssh_user or "").strip()
        deps.host_ssh_port = int(ssh_host.ssh_port or 22)

    prefix = "\n".join(prefix_lines).strip()
    if prefix:
        prefix = prefix + "\n\n"
    return deps, prefix


def parse_context_payload(raw: dict | None) -> ChatAttachmentContext:
    if not raw:
        return ChatAttachmentContext([], [], [], [], [])
    return ChatAttachmentContext(
        host_ids=list(raw.get("hosts") or []),
        playbook_ids=list(raw.get("playbooks") or []),
        role_ids=list(raw.get("roles") or []),
        run_ids=list(raw.get("runs") or []),
        rack_ids=list(raw.get("racks") or []),
    )
