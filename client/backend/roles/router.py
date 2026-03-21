"""Roles CRUD, run router, and registry proxy."""

from __future__ import annotations

from typing import NoReturn

import httpx
import structlog
import yaml
from fastapi import APIRouter, Cookie, HTTPException, Query, WebSocket
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

import settings
from _utils.websocket import require_ws_session, ws_error_handler
from auth.dependencies import CurrentSession
from playbooks.schemas import FolderUpdate
from roles.managers import role_manager
from roles.registry import registry_manager
from roles.registry_schemas import (
    PlaybookFacets,
    PlaybookImportResponse,
    RegistryFacets,
    RegistryPlaybook,
    RegistryPlaybookList,
    RegistryRole,
    RegistryRoleList,
    RoleImportResponse,
)
from roles.schemas import (
    EditGenerateRequest,
    GenerateRequest,
    RoleCreate,
    RoleDetailResponse,
    RoleFromYaml,
    RoleFromYamlResponse,
    RoleListResponse,
    RoleRunRequest,
    RoleRunResponse,
    RoleUpdate,
)

logger = structlog.get_logger(__name__)

roles_router = APIRouter()


@roles_router.post("/generate")
async def generate_role(
    body: GenerateRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Generate an Ansible role from a natural-language prompt via AI."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI generation is not configured (OPENAI_API_KEY missing)")
    return StreamingResponse(
        role_manager.generate_with_validation(session, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@roles_router.post("/edit-generate")
async def edit_generate_role(
    body: EditGenerateRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Edit an existing role YAML via AI from a natural-language prompt."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI generation is not configured (OPENAI_API_KEY missing)")
    return StreamingResponse(
        role_manager.edit_with_validation(session, body.existing_yaml, body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@roles_router.post("/from-yaml", status_code=201, response_model=RoleFromYamlResponse)
async def create_role_from_yaml(
    body: RoleFromYaml,
    session: CurrentSession,
) -> RoleFromYamlResponse:
    """Parse a single YAML document containing both role metadata and tasks, then create the role."""
    try:
        data = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError as exc:
        logger.warning("role_from_yaml_parse_error", error=str(exc), exc_info=True)
        raise HTTPException(status_code=400, detail="Invalid YAML syntax") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML must be a mapping (dict)")
    try:
        request = RoleCreate.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    role = role_manager.create_role(session, request)
    return RoleFromYamlResponse(role=role)


@roles_router.get("", response_model=RoleListResponse)
async def list_roles(session: CurrentSession) -> RoleListResponse:
    """List all roles in the active repo."""
    return RoleListResponse(roles=role_manager.list_roles(session))


@roles_router.websocket("/runs/{run_id}/stream")
async def stream_run(
    websocket: WebSocket,
    run_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> None:
    """Stream live role run output over WebSocket."""
    session = await require_ws_session(websocket, session_id)
    if not session:
        return
    await websocket.accept()
    async with ws_error_handler(websocket):
        await role_manager.stream_run(run_id, websocket)


@roles_router.get("/{role_id}/detail", response_model=RoleDetailResponse)
async def get_role_detail(role_id: str, session: CurrentSession) -> RoleDetailResponse:
    """Get full role detail including raw YAML content."""
    return RoleDetailResponse(role=role_manager.get_role_detail(session, role_id))


@roles_router.put("/{role_id}", response_model=RoleDetailResponse)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    session: CurrentSession,
) -> RoleDetailResponse:
    """Update an existing role via raw YAML."""
    role = role_manager.update_role(session, role_id, body)
    return RoleDetailResponse(role=role)


@roles_router.patch("/{role_id}/folder", status_code=204)
async def move_role_to_folder(
    role_id: str,
    body: FolderUpdate,
    session: CurrentSession,
) -> None:
    """Update the sidebar folder for a role."""
    role_manager.move_to_folder(session, role_id, body.folder)


@roles_router.delete("/{role_id}", status_code=204)
async def delete_role(role_id: str, session: CurrentSession) -> None:
    """Delete a role by ID."""
    role_manager.delete_role(session, role_id)


@roles_router.post("/{role_id}/runs", status_code=201, response_model=RoleRunResponse)
async def create_run(
    role_id: str,
    body: RoleRunRequest,
    session: CurrentSession,
) -> RoleRunResponse:
    """Queue a new role run against the given targets."""
    run = await role_manager.create_run(session, role_id, body)
    return RoleRunResponse(run=run)


# ---------------------------------------------------------------------------
# Registry proxy routes (mounted at /api/registry)
# ---------------------------------------------------------------------------

registry_router = APIRouter()


def _handle_registry_error(exc: Exception) -> NoReturn:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    if isinstance(exc, FileNotFoundError):
        logger.warning("registry_not_found", error=str(exc), exc_info=True)
        raise HTTPException(status_code=404, detail="Resource not found") from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    logger.error("registry_unexpected_error", error=str(exc), exc_info=True)
    raise HTTPException(status_code=500, detail="Internal server error") from exc


@registry_router.get("/roles/facets", response_model=RegistryFacets)
async def get_registry_facets(
    session: CurrentSession,
) -> RegistryFacets | None:
    """Get aggregated tags and platforms from the registry."""
    try:
        return await registry_manager.get_facets(session)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.get("/roles", response_model=RegistryRoleList)
async def list_registry_roles(
    session: CurrentSession,
    q: str | None = Query(None),
    tags: str | None = Query(None),
    platforms: str | None = Query(None),
    owner: str | None = Query(None),
    sort: str = Query("recent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> RegistryRoleList:
    """Search and browse roles in the community registry."""
    return await registry_manager.list_roles(
        session,
        q=q,
        tags=tags,
        platforms=platforms,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )


@registry_router.get("/roles/{role_id}", response_model=RegistryRole)
async def get_registry_role(
    role_id: str,
    session: CurrentSession,
) -> RegistryRole | None:
    """Get a single registry role by id."""
    try:
        return await registry_manager.get_role(session, role_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.post("/roles/{role_id}/push", response_model=RegistryRole)
async def push_role(
    role_id: str,
    session: CurrentSession,
) -> RegistryRole | None:
    """Push a local role to the community registry."""
    try:
        return await registry_manager.push_role(session, role_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.post("/roles/{role_id}/import", response_model=RoleImportResponse)
async def import_role(
    role_id: str,
    session: CurrentSession,
) -> RoleImportResponse | None:
    """Import a role from the registry into the active repo."""
    try:
        return await registry_manager.import_role(session, role_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.delete("/roles/{role_id}", status_code=204)
async def delete_registry_role(
    role_id: str,
    session: CurrentSession,
) -> None:
    """Delete a role from the community registry."""
    try:
        await registry_manager.delete_role(session, role_id)
    except Exception as exc:
        _handle_registry_error(exc)


# ---------------------------------------------------------------------------
# Registry playbook proxy routes
# ---------------------------------------------------------------------------


@registry_router.get("/playbooks/facets", response_model=PlaybookFacets)
async def get_registry_playbook_facets(
    session: CurrentSession,
) -> PlaybookFacets | None:
    """Get aggregated tags from the registry for playbooks."""
    try:
        return await registry_manager.get_playbook_facets(session)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.get("/playbooks", response_model=RegistryPlaybookList)
async def list_registry_playbooks(
    session: CurrentSession,
    q: str | None = Query(None),
    tags: str | None = Query(None),
    owner: str | None = Query(None),
    sort: str = Query("recent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> RegistryPlaybookList:
    """Search and browse playbooks in the community registry."""
    return await registry_manager.list_playbooks(
        session,
        q=q,
        tags=tags,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )


@registry_router.get("/playbooks/{playbook_id}", response_model=RegistryPlaybook)
async def get_registry_playbook(
    playbook_id: str,
    session: CurrentSession,
) -> RegistryPlaybook | None:
    """Get a single registry playbook by id."""
    try:
        return await registry_manager.get_playbook(session, playbook_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.post("/playbooks/{playbook_id}/push", response_model=RegistryPlaybook)
async def push_playbook(
    playbook_id: str,
    session: CurrentSession,
) -> RegistryPlaybook | None:
    """Push a local playbook to the community registry."""
    try:
        return await registry_manager.push_playbook(session, playbook_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.post("/playbooks/{playbook_id}/import", response_model=PlaybookImportResponse)
async def import_playbook(
    playbook_id: str,
    session: CurrentSession,
) -> PlaybookImportResponse | None:
    """Import a playbook from the registry into the active repo."""
    try:
        return await registry_manager.import_playbook(session, playbook_id)
    except Exception as exc:
        _handle_registry_error(exc)


@registry_router.delete("/playbooks/{playbook_id}", status_code=204)
async def delete_registry_playbook(
    playbook_id: str,
    session: CurrentSession,
) -> None:
    """Delete a playbook from the community registry."""
    try:
        await registry_manager.delete_playbook(session, playbook_id)
    except Exception as exc:
        _handle_registry_error(exc)
