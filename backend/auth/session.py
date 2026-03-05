"""Redis-backed session store and auth dependency."""

from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

import redis
from fastapi import Cookie, HTTPException, Request

import settings


@dataclass
class SessionData:
    access_token: str
    user: dict[str, Any]
    created_at: float


_session_prefix = "racksmith:session:"
_redis_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def _key(session_id: str) -> str:
    return f"{_session_prefix}{session_id}"


def _serialize(data: SessionData) -> str:
    return json.dumps(
        {
            "access_token": data.access_token,
            "user": data.user,
            "created_at": data.created_at,
        }
    )


def _deserialize(raw: str) -> SessionData | None:
    try:
        d = json.loads(raw)
        return SessionData(
            access_token=d["access_token"],
            user=d["user"],
            created_at=float(d["created_at"]),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def create_session(access_token: str, user: dict[str, Any]) -> str:
    session_id = secrets.token_urlsafe(32)
    data = SessionData(
        access_token=access_token,
        user=user,
        created_at=time.time(),
    )
    key = _key(session_id)
    _redis().setex(key, settings.SESSION_MAX_AGE, _serialize(data))
    return session_id


def get_session(session_id: str | None) -> SessionData | None:
    if not session_id:
        return None
    raw = _redis().get(_key(session_id))
    if not raw:
        return None
    data = _deserialize(raw)
    if not data:
        return None
    if time.time() - data.created_at > settings.SESSION_MAX_AGE:
        delete_session(session_id)
        return None
    return data


def delete_session(session_id: str | None) -> None:
    if session_id:
        _redis().delete(_key(session_id))


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
