"""SSH router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, WebSocket, WebSocketDisconnect

import settings
from github.misc import get_session
from ssh.managers import ssh_manager
from ssh.schemas import PingStatusRequest

router = APIRouter()


def _require_session(session_id: str | None):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session


@router.get("/hosts/{host_id}/history")
async def list_history(
    host_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """List SSH command history for a host."""
    session = _require_session(session_id)
    try:
        history = ssh_manager.list_history(session, host_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"history": [entry.model_dump() for entry in history]}


@router.post("/hosts/{host_id}/reboot", status_code=202)
async def reboot_node(
    host_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Reboot a remote host via SSH."""
    session = _require_session(session_id)
    try:
        await ssh_manager.reboot_node(session, host_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "rebooting"}


@router.post("/ping-status")
async def ping_statuses(
    body: PingStatusRequest,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Ping multiple hosts and return their reachability status."""
    session = _require_session(session_id)
    statuses = await ssh_manager.ping_statuses(session, body.targets)
    return {"statuses": [entry.model_dump() for entry in statuses]}


@router.post("/generate-key")
async def generate_key(
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Generate a new SSH key pair and return the public key."""
    session = _require_session(session_id)
    try:
        public_key = ssh_manager.generate_key(session)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"public_key": public_key}


@router.get("/public-key")
async def get_public_key(
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Get the current SSH public key."""
    session = _require_session(session_id)
    try:
        public_key = ssh_manager.public_key(session)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"public_key": public_key}


@router.websocket("/hosts/{host_id}/terminal")
async def terminal_socket(
    websocket: WebSocket,
    host_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Open an interactive SSH terminal session over WebSocket."""
    session = get_session(session_id)
    if not session:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    await websocket.accept()
    try:
        await ssh_manager.proxy_terminal(session, host_id, websocket)
    except WebSocketDisconnect:
        return
    except (KeyError, ValueError) as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4400)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
