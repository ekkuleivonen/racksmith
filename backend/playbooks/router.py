"""Playbook REST and websocket router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect

import settings
from github.managers import auth_manager
from github.misc import get_session
from playbooks.managers import playbook_manager
from playbooks.schemas import (
    PlaybookRunRequest,
    PlaybookUpsertRequest,
    ResolveTargetsRequest,
)

router = APIRouter()


@router.get("")
async def list_playbooks(session=Depends(auth_manager.get_current_session)):
    playbooks = playbook_manager.list_playbooks(session)
    roles = playbook_manager.roles_catalog(session)
    return {"playbooks": playbooks, "roles": roles}


@router.post("", status_code=201)
async def create_playbook(
    body: PlaybookUpsertRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        playbook = playbook_manager.create_playbook(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"playbook": playbook}


@router.post("/resolve-targets")
async def resolve_targets(
    body: ResolveTargetsRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        result = playbook_manager.resolve_targets(session, body.targets)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result


# Static /runs routes must come before /{playbook_id} so "runs" is not matched as playbook_id
@router.get("/runs")
async def list_runs(
    playbook_id: str | None = None,
    session=Depends(auth_manager.get_current_session),
):
    return {"runs": await playbook_manager.list_runs(session, playbook_id=playbook_id)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        run = await playbook_manager.get_run(session, run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run": run}


@router.get("/{playbook_id}")
async def get_playbook(
    playbook_id: str, session=Depends(auth_manager.get_current_session)
):
    try:
        playbook = playbook_manager.get_playbook(session, playbook_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Playbook not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"playbook": playbook}


@router.put("/{playbook_id}")
async def update_playbook(
    playbook_id: str,
    body: PlaybookUpsertRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        playbook = playbook_manager.update_playbook(session, playbook_id, body)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Playbook not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"playbook": playbook}


@router.delete("/{playbook_id}", status_code=204)
async def delete_playbook(
    playbook_id: str, session=Depends(auth_manager.get_current_session)
):
    try:
        playbook_manager.delete_playbook(session, playbook_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Playbook not found")


@router.post("/{playbook_id}/runs", status_code=201)
async def create_run(
    playbook_id: str,
    body: PlaybookRunRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        run = await playbook_manager.create_run(session, playbook_id, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
        await playbook_manager.stream_run(session, run_id, websocket)
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
