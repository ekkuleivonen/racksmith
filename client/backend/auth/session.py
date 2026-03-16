"""Session management and user identity helpers."""

from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Cookie, HTTPException, Request

import settings
from _utils.logging import get_logger
from _utils.redis import AsyncRedis

logger = get_logger(__name__)


@dataclass
class SessionData:
    access_token: str
    user: dict[str, Any]
    created_at: float
    refresh_token: str = ""
    session_id: str = ""


def _session_key(session_id: str) -> str:
    return f"{settings.REDIS_SESSION_PREFIX}{session_id}"


async def create_session(
    access_token: str,
    user: dict[str, Any],
    refresh_token: str = "",
) -> str:
    session_id = secrets.token_urlsafe(32)
    data = SessionData(
        access_token=access_token,
        user=user,
        created_at=time.time(),
        refresh_token=refresh_token,
    )
    payload = json.dumps({
        "access_token": data.access_token,
        "user": data.user,
        "created_at": data.created_at,
        "refresh_token": data.refresh_token,
    })
    await AsyncRedis.setex(_session_key(session_id), settings.SESSION_MAX_AGE, payload)
    return session_id


async def get_session(session_id: str | None) -> SessionData | None:
    if not session_id:
        return None
    raw = await AsyncRedis.get(_session_key(session_id))
    if not raw:
        return None
    try:
        d = json.loads(raw)
        data = SessionData(
            access_token=d["access_token"],
            user=d["user"],
            created_at=float(d["created_at"]),
            refresh_token=d.get("refresh_token", ""),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    if time.time() - data.created_at > settings.SESSION_MAX_AGE:
        await delete_session(session_id)
        return None
    data.session_id = session_id
    return data


async def update_session_tokens(
    session_id: str, access_token: str, refresh_token: str
) -> None:
    """Update access_token and refresh_token in an existing Redis session."""
    raw = await AsyncRedis.get(_session_key(session_id))
    if not raw:
        return
    try:
        d = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return
    d["access_token"] = access_token
    d["refresh_token"] = refresh_token
    await AsyncRedis.setex(_session_key(session_id), settings.SESSION_MAX_AGE, json.dumps(d))


async def delete_session(session_id: str | None) -> None:
    if session_id:
        await AsyncRedis.delete(_session_key(session_id))


def user_storage_id(user: dict[str, Any]) -> str:
    value = user.get("id")
    if value in (None, ""):
        raise ValueError("Missing GitHub user id")
    return str(value)


def user_login(user: dict[str, Any]) -> str:
    return str(user.get("login") or "").strip()


async def get_current_user(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> dict[str, Any]:
    """FastAPI dependency — returns current user or raises 401."""
    data = await get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data.user


async def get_current_session(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> SessionData:
    """FastAPI dependency — returns full session (including token) or raises 401."""
    data = await get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data
