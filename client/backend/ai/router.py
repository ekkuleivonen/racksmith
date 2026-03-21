"""AI generation endpoints (streaming) — action namespace under /api/ai."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import settings
from auth.dependencies import CurrentSession
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
    return StreamingResponse(
        playbook_manager.generate_playbook(session, body.prompt),
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
    return StreamingResponse(
        playbook_manager.edit_generate_playbook(session, playbook_id, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
