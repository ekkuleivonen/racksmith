"""Actions CRUD and run router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect

import yaml
from pydantic import ValidationError

import settings
from actions.managers import action_manager
from actions.schemas import ActionCreateRequest, ActionFromYamlRequest, ActionRunRequest, ActionUpdateRequest
from github.managers import auth_manager
from github.misc import get_session

router = APIRouter()


@router.post("/from-yaml", status_code=201)
def create_action_from_yaml(
    body: ActionFromYamlRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Parse a single YAML document containing both action metadata and tasks, then create the action."""
    try:
        data = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML must be a mapping (dict)")
    try:
        request = ActionCreateRequest.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    try:
        action = action_manager.create_action(session, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"action": action}


@router.get("")
def list_actions(session=Depends(auth_manager.get_current_session)):
    return {"actions": action_manager.list_actions(session)}


# Runs list — must come before /{slug} to avoid being matched as a slug
@router.get("/runs")
async def list_runs(action_slug: str | None = None, session=Depends(auth_manager.get_current_session)):
    return {"runs": await action_manager.list_runs(session, action_slug=action_slug)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        run = await action_manager.get_run(session, run_id)
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
        await action_manager.stream_run(session, run_id, websocket)
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)


@router.get("/{slug}/detail")
def get_action_detail(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"action": action_manager.get_action_detail(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{slug}")
def get_action(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"action": action_manager.get_action(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", status_code=201)
def create_action(
    body: ActionCreateRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        action = action_manager.create_action(session, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"action": action}


@router.put("/{slug}")
def update_action(
    slug: str,
    body: ActionUpdateRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        action = action_manager.update_action(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"action": action}


@router.delete("/{slug}", status_code=204)
def delete_action(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        action_manager.delete_action(session, slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{slug}/runs", status_code=201)
async def create_run(
    slug: str,
    body: ActionRunRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        run = await action_manager.create_run(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": run}
