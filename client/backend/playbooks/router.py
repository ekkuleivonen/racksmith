"""Playbook REST and websocket router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, WebSocket
from fastapi.responses import StreamingResponse

import settings
from _utils.websocket import require_ws_session, ws_error_handler
from auth.dependencies import CurrentSession
from playbooks.managers import playbook_manager
from playbooks.schemas import (
    GeneratePlaybookRequest,
    PlaybookListResponse,
    PlaybookResponse,
    PlaybookRunRequest,
    PlaybookRunResponse,
    PlaybookUpsert,
    ResolveTargetsRequest,
    ResolveTargetsResponse,
)

router = APIRouter()


@router.get("", response_model=PlaybookListResponse)
async def list_playbooks(session: CurrentSession) -> PlaybookListResponse:
    """List all playbooks and the available roles catalog."""
    playbooks = playbook_manager.list_playbooks(session)
    roles = playbook_manager.roles_catalog(session)
    return PlaybookListResponse(playbooks=playbooks, roles=roles)


@router.post("", status_code=201, response_model=PlaybookResponse)
async def create_playbook(
    body: PlaybookUpsert,
    session: CurrentSession,
) -> PlaybookResponse:
    """Create a new playbook."""
    playbook = playbook_manager.create_playbook(session, body)
    return PlaybookResponse(playbook=playbook)


@router.post("/generate")
async def generate_playbook(
    body: GeneratePlaybookRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Generate a playbook (roles + assembly) from a natural-language prompt via AI."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI generation is not configured (OPENAI_API_KEY missing)",
        )
    return StreamingResponse(
        playbook_manager.generate_playbook(session, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/resolve-targets", response_model=ResolveTargetsResponse)
async def resolve_targets(
    body: ResolveTargetsRequest,
    session: CurrentSession,
) -> ResolveTargetsResponse:
    """Resolve target patterns to concrete host lists."""
    return playbook_manager.resolve_targets(session, body.targets)


@router.get("/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: str, session: CurrentSession
) -> PlaybookResponse:
    """Get a single playbook by ID."""
    playbook = playbook_manager.get_playbook(session, playbook_id)
    return PlaybookResponse(playbook=playbook)


@router.put("/{playbook_id}", response_model=PlaybookResponse)
async def update_playbook(
    playbook_id: str,
    body: PlaybookUpsert,
    session: CurrentSession,
) -> PlaybookResponse:
    """Update an existing playbook."""
    playbook = playbook_manager.update_playbook(session, playbook_id, body)
    return PlaybookResponse(playbook=playbook)


@router.delete("/{playbook_id}", status_code=204)
async def delete_playbook(
    playbook_id: str, session: CurrentSession, cascade_roles: bool = False
) -> None:
    """Delete a playbook by ID, optionally removing roles not used elsewhere."""
    playbook_manager.delete_playbook(session, playbook_id, cascade_roles=cascade_roles)


@router.post("/{playbook_id}/runs", status_code=201, response_model=PlaybookRunResponse)
async def create_run(
    playbook_id: str,
    body: PlaybookRunRequest,
    session: CurrentSession,
) -> PlaybookRunResponse:
    """Queue a new playbook run against the given targets."""
    run = await playbook_manager.create_run(session, playbook_id, body)
    return PlaybookRunResponse(run=run)


@router.websocket("/runs/{run_id}/stream")
async def stream_run(
    websocket: WebSocket,
    run_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> None:
    """Stream live playbook run output over WebSocket."""
    session = await require_ws_session(websocket, session_id)
    if not session:
        return
    await websocket.accept()
    async with ws_error_handler(websocket):
        await playbook_manager.stream_run(run_id, websocket)
