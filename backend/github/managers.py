"""GitHub auth/session management."""

from __future__ import annotations

import secrets
from typing import Any
from urllib.parse import urlencode

import httpx

from _utils.logging import get_logger

logger = get_logger(__name__)
from fastapi import Cookie, HTTPException, Request

import settings
from github.misc import SessionData, create_session, delete_session, get_session


class AuthManager:
    """OAuth flow, session lifecycle, and FastAPI auth dependencies."""

    def __init__(self) -> None:
        self._oauth_states: dict[str, bool] = {}

    def get_login_url(self, redirect_uri: str) -> str:
        state = secrets.token_urlsafe(32)
        self._oauth_states[state] = True
        params = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": settings.GITHUB_OAUTH_SCOPES,
            "state": state,
        }
        return f"{settings.GITHUB_OAUTH_BASE}/login/oauth/authorize?{urlencode(params)}"

    async def handle_callback(
        self, code: str | None, state: str | None, redirect_uri: str
    ) -> str | None:
        if not code or not state or state not in self._oauth_states:
            logger.warning("auth_login_failed", reason="invalid_or_missing_state")
            return None
        del self._oauth_states[state]

        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                f"{settings.GITHUB_OAUTH_BASE}/login/oauth/access_token",
                params={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
        access_token = token_resp.json().get("access_token")
        if not access_token:
            logger.warning("auth_login_failed", reason="no_token_in_response")
            return None

        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                f"{settings.GITHUB_API_BASE}/user",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if user_resp.status_code != 200:
            logger.warning("auth_login_failed", reason="user_fetch_failed", status_code=user_resp.status_code)
            return None

        user_data = user_resp.json()
        session_id = create_session(access_token, user_data)
        logger.info("auth_login_success", user_id=str(user_data.get("id", "")))
        return session_id

    def logout(self, session_id: str | None) -> None:
        delete_session(session_id)

    def get_current_user(
        self,
        request: Request,
        session_id: str | None = Cookie(
            default=None, alias=settings.SESSION_COOKIE_NAME
        ),
    ) -> dict[str, Any]:
        data = get_session(session_id)
        if not data:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return data.user

    def get_current_session(
        self,
        request: Request,
        session_id: str | None = Cookie(
            default=None, alias=settings.SESSION_COOKIE_NAME
        ),
    ) -> SessionData:
        data = get_session(session_id)
        if not data:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return data


auth_manager = AuthManager()
