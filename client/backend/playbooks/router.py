"""Playbook REST and websocket router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Query, WebSocket

import settings
from _utils.pagination import paginate
from _utils.schemas import PaginatedResponse
from _utils.websocket import require_ws_session, ws_error_handler
from auth.dependencies import CurrentSession
from playbooks.managers import playbook_manager
from playbooks.schemas import (
    AvailableVarsResponse,
    FolderUpdate,
    PlaybookCatalogResponse,
    PlaybookCreate,
    PlaybookResponse,
    PlaybookRunRequest,
    PlaybookRunResponse,
    PlaybookSummary,
    PlaybookUpdate,
    RequiredRuntimeVarsResponse,
    ResolveTargetsRequest,
    ResolveTargetsResponse,
)

router = APIRouter()


@router.get("/catalog", response_model=PlaybookCatalogResponse)
async def playbook_roles_catalog(session: CurrentSession) -> PlaybookCatalogResponse:
    """Roles catalog for playbook authoring."""
    roles = playbook_manager.roles_catalog(session)
    return PlaybookCatalogResponse(roles=roles)


@router.get("", response_model=PaginatedResponse[PlaybookSummary])
async def list_playbooks(
    session: CurrentSession,
    q: str | None = Query(None, description="Search name or description"),
    label: str | None = Query(None, description="Substring match on name or description"),
    sort: str = Query("name", description="Sort field: name, id, updated_at"),
    order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[PlaybookSummary]:
    """List playbooks in the active repo (paginated)."""
    rows = playbook_manager.list_playbooks_filtered(
        session, q=q, label=label, sort=sort, order=order
    )
    slice_rows, total = paginate(rows, page=page, per_page=per_page)
    return PaginatedResponse(items=slice_rows, total=total, page=page, per_page=per_page)


@router.post("", status_code=201, response_model=PlaybookResponse)
async def create_playbook(
    body: PlaybookCreate,
    session: CurrentSession,
) -> PlaybookResponse:
    """Create a new playbook."""
    playbook = playbook_manager.create_playbook(session, body)
    return PlaybookResponse(playbook=playbook)


@router.post("/resolve-targets", response_model=ResolveTargetsResponse)
async def resolve_targets(
    body: ResolveTargetsRequest,
    session: CurrentSession,
) -> ResolveTargetsResponse:
    """Resolve target patterns to concrete host lists."""
    return playbook_manager.resolve_targets(session, body.targets)


@router.get("/{playbook_id}/available-vars", response_model=AvailableVarsResponse)
async def available_vars(
    playbook_id: str, session: CurrentSession
) -> AvailableVarsResponse:
    """Return all variable sources available to a playbook."""
    return playbook_manager.get_available_vars(session, playbook_id)


@router.get("/{playbook_id}/required-runtime-vars", response_model=RequiredRuntimeVarsResponse)
async def required_runtime_vars(
    playbook_id: str, session: CurrentSession
) -> RequiredRuntimeVarsResponse:
    """Return inputs that require user-provided values at run time."""
    return playbook_manager.get_required_runtime_vars(session, playbook_id)


@router.get("/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: str, session: CurrentSession
) -> PlaybookResponse:
    """Get a single playbook by ID."""
    playbook = playbook_manager.get_playbook(session, playbook_id)
    return PlaybookResponse(playbook=playbook)


@router.patch("/{playbook_id}", response_model=PlaybookResponse)
async def update_playbook(
    playbook_id: str,
    body: PlaybookUpdate,
    session: CurrentSession,
) -> PlaybookResponse:
    """Update an existing playbook."""
    playbook = playbook_manager.update_playbook(session, playbook_id, body)
    return PlaybookResponse(playbook=playbook)


@router.patch("/{playbook_id}/folder", status_code=204)
async def move_playbook_to_folder(
    playbook_id: str,
    body: FolderUpdate,
    session: CurrentSession,
) -> None:
    """Update the sidebar folder for a playbook."""
    playbook_manager.move_to_folder(session, playbook_id, body.folder)


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
