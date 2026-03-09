"""Roles CRUD and run router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect

import yaml
from pydantic import ValidationError

import settings
from github.managers import auth_manager
from github.misc import get_session
from roles.managers import role_manager
from roles.schemas import (
    RoleCreateRequest,
    RoleFromYamlRequest,
    RoleRunRequest,
    RoleUpdateRequest,
)

router = APIRouter()


@router.post("/from-yaml", status_code=201)
def create_role_from_yaml(
    body: RoleFromYamlRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Parse a single YAML document containing both role metadata and tasks, then create the role."""
    try:
        data = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML must be a mapping (dict)")
    try:
        request = RoleCreateRequest.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    try:
        role = role_manager.create_role(session, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.get("")
def list_roles(session=Depends(auth_manager.get_current_session)):
    return {"roles": role_manager.list_roles(session)}


# Static /runs routes must come before /{slug} so "runs" is not matched as slug
@router.get("/runs")
async def list_runs(
    role_slug: str | None = None,
    session=Depends(auth_manager.get_current_session),
):
    return {"runs": await role_manager.list_runs(session, role_slug=role_slug)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        run = await role_manager.get_run(session, run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run": run}


@router.websocket("/runs/{run_id}/stream")
async def stream_run(
    websocket: WebSocket,
    run_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    session = get_session(session_id)
    if not session:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    await websocket.accept()
    try:
        await role_manager.stream_run(session, run_id, websocket)
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)


@router.get("/{slug}/detail")
def get_role_detail(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"role": role_manager.get_role_detail(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{slug}")
def get_role(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"role": role_manager.get_role(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", status_code=201)
def create_role(
    body: RoleCreateRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        role = role_manager.create_role(session, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.put("/{slug}")
def update_role(
    slug: str,
    body: RoleUpdateRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        role = role_manager.update_role(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.delete("/{slug}", status_code=204)
def delete_role(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        role_manager.delete_role(session, slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{slug}/runs", status_code=201)
async def create_run(
    slug: str,
    body: RoleRunRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        run = await role_manager.create_run(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": run}
