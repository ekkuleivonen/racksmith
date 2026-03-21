"""AI generation endpoints (streaming) — action namespace under /api/ai."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import settings
from _utils.exceptions import NotFoundError
from auth.dependencies import CurrentSession
from auth.session import SessionData
from hosts.managers import host_manager
from hosts.schemas import Host
from playbooks.managers import playbook_manager
from playbooks.schemas import EditGeneratePlaybookRequest, GeneratePlaybookRequest
from roles.managers import role_manager
from roles.schemas import GenerateRequest, RoleAiEditRequest

router = APIRouter()


def _require_openai() -> None:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI generation is not configured (OPENAI_API_KEY missing)",
        )


def _resolve_ai_probe_host(session: SessionData, host_id: str | None) -> Host | None:
    """Return a managed host with SSH details, or None. Raises HTTPException on bad id."""
    if not host_id or not str(host_id).strip():
        return None
    hid = str(host_id).strip()
    try:
        host = host_manager.get_host(session, hid)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not host.managed:
        raise HTTPException(
            status_code=400,
            detail="Probe host must be managed for SSH access",
        )
    if not (host.ip_address or "").strip() or not (host.ssh_user or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Probe host is missing IP address or ssh_user",
        )
    return host


@router.post("/roles/generate")
async def generate_role(
    body: GenerateRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Generate an Ansible role from a natural-language prompt via AI."""
    _require_openai()
    return StreamingResponse(
        role_manager.generate_with_validation(session, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/roles/{role_id}/edit")
async def edit_generate_role(
    role_id: str,
    body: RoleAiEditRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Edit an existing role via AI from a natural-language prompt."""
    _require_openai()
    try:
        detail = role_manager.get_role_detail(session, role_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found") from exc
    existing_yaml = detail.raw_content or ""
    return StreamingResponse(
        role_manager.edit_with_validation(session, existing_yaml, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/playbooks/generate")
async def generate_playbook(
    body: GeneratePlaybookRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Generate a playbook (roles + assembly) from a natural-language prompt via AI."""
    _require_openai()
    probe_host = _resolve_ai_probe_host(session, body.host_id)
    return StreamingResponse(
        playbook_manager.generate_playbook(
            session, body.prompt, probe_host=probe_host
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/playbooks/{playbook_id}/edit")
async def edit_generate_playbook(
    playbook_id: str,
    body: EditGeneratePlaybookRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Edit a playbook from a natural-language prompt via AI."""
    _require_openai()
    probe_host = _resolve_ai_probe_host(session, body.host_id)
    return StreamingResponse(
        playbook_manager.edit_generate_playbook(
            session, playbook_id, body.prompt, probe_host=probe_host
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/runs/{run_id}/debug")
async def debug_failed_playbook_run(
    run_id: str,
    session: CurrentSession,
) -> StreamingResponse:
    """Debug a failed playbook run: AI reads output, may SSH to first host, edits roles/playbook."""
    _require_openai()
    run = await playbook_manager.load_playbook_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found or expired")
    if run.status != "failed":
        raise HTTPException(
            status_code=400,
            detail="Run did not fail; nothing to debug",
        )
    if not run.hosts:
        raise HTTPException(status_code=400, detail="Run has no target hosts")
    try:
        host = host_manager.get_host(session, run.hosts[0])
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not host.managed:
        raise HTTPException(
            status_code=400,
            detail="First target host is not managed; SSH debug unavailable",
        )
    if not (host.ip_address or "").strip() or not (host.ssh_user or "").strip():
        raise HTTPException(
            status_code=400,
            detail="First target host is missing IP address or ssh_user",
        )
    return StreamingResponse(
        playbook_manager.debug_failed_run(session, run, host),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
