"""In-memory session store and auth dependency."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Cookie, HTTPException, Request

import settings


@dataclass
class SessionData:
    access_token: str
    user: dict[str, Any]
    created_at: float


# In-memory session store: session_id -> SessionData
_session_store: dict[str, SessionData] = {}


def create_session(access_token: str, user: dict[str, Any]) -> str:
    session_id = secrets.token_urlsafe(32)
    _session_store[session_id] = SessionData(
        access_token=access_token,
        user=user,
        created_at=time.time(),
    )
    return session_id


def get_session(session_id: str | None) -> SessionData | None:
    if not session_id:
        return None
    data = _session_store.get(session_id)
    if not data:
        return None
    if time.time() - data.created_at > settings.SESSION_MAX_AGE:
        del _session_store[session_id]
        return None
    return data


def delete_session(session_id: str | None) -> None:
    if session_id and session_id in _session_store:
        del _session_store[session_id]


def get_current_user(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> dict[str, Any]:
    """Dependency that returns current user or raises 401."""
    data = get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data.user


def get_current_session(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> SessionData:
    """Dependency that returns full session data (including token) or raises 401."""
    data = get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data
