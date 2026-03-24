"""WebSocket authentication and error handling helpers."""

from __future__ import annotations

import contextlib

from fastapi import WebSocket, WebSocketDisconnect

from _utils.logging import get_logger
from auth.session import SessionData, get_session

logger = get_logger(__name__)


async def require_ws_session(
    websocket: WebSocket,
    session_id: str | None,
) -> SessionData | None:
    """Authenticate a WebSocket from the session cookie. Returns None and closes on failure."""
    session = await get_session(session_id)
    if not session:
        await websocket.close(code=4401, reason="Not authenticated")
        return None
    return session


@contextlib.asynccontextmanager
async def ws_error_handler(websocket: WebSocket):
    """Context manager for standard WebSocket error handling."""
    try:
        yield
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
        return
    except Exception:
        logger.exception("ws_unhandled_error")
        await websocket.send_json({"type": "error", "message": "Internal error"})
        await websocket.close(code=1011)
        return
    await websocket.close(code=1000)
