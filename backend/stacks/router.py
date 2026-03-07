"""Stack REST and websocket router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect

import settings
from github.managers import auth_manager
from github.misc import get_session
from stacks.managers import stack_manager
from stacks.schemas import (
    StackResolveTargetsRequest,
    StackRunRequest,
    StackUpsertRequest,
)

router = APIRouter()


@router.get("")
async def list_stacks(session=Depends(auth_manager.get_current_session)):
    return {
        "stacks": stack_manager.list_stacks(session),
        "actions": stack_manager.actions(session),
    }


@router.post("", status_code=201)
async def create_stack(
    body: StackUpsertRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        stack = stack_manager.create_stack(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"stack": stack}


@router.post("/resolve-targets")
async def resolve_targets(
    body: StackResolveTargetsRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        result = stack_manager.resolve_targets(session, body.targets)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result


@router.get("/runs")
async def list_runs(stack_id: str | None = None, session=Depends(auth_manager.get_current_session)):
    return {"runs": await stack_manager.list_runs(session, stack_id=stack_id)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        run = await stack_manager.get_run(session, run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run": run}


@router.get("/{stack_id}")
async def get_stack(stack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        stack = stack_manager.get_stack(session, stack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"stack": stack}


@router.put("/{stack_id}")
async def update_stack(
    stack_id: str,
    body: StackUpsertRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        stack = stack_manager.update_stack(session, stack_id, body)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"stack": stack}


@router.delete("/{stack_id}", status_code=204)
async def delete_stack(stack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        stack_manager.delete_stack(session, stack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stack not found")


@router.post("/{stack_id}/runs", status_code=201)
async def create_run(
    stack_id: str,
    body: StackRunRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        run = await stack_manager.create_run(session, stack_id, body)
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
        await stack_manager.stream_run(session, run_id, websocket)
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
