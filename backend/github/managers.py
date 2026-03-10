"""Auth management: registry-mediated OAuth, session lifecycle, token refresh."""

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
    """Registry-mediated OAuth flow, session lifecycle, and FastAPI auth deps."""

    def __init__(self) -> None:
        self._oauth_states: dict[str, bool] = {}

    def get_registry_login_url(self, callback_url: str) -> str:
        """Build the URL to redirect the user to registry's OAuth entry point."""
        state = secrets.token_urlsafe(32)
        self._oauth_states[state] = True
        params = {
            "callback_url": callback_url,
            "state": state,
        }
        registry_url = settings.REGISTRY_URL.rstrip("/")
        return f"{registry_url}/auth/login?{urlencode(params)}"

    def validate_state(self, state: str | None) -> bool:
        """Validate and consume a CSRF state token."""
        if not state or state not in self._oauth_states:
            return False
        del self._oauth_states[state]
        return True

    async def exchange_code(self, exchange_code: str) -> str | None:
        """Exchange a one-time code with registry for GH token + user, create session."""
        registry_url = settings.REGISTRY_URL.rstrip("/")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{registry_url}/auth/exchange",
                    json={"exchange_code": exchange_code},
                    timeout=10,
                )
            if resp.status_code != 200:
                logger.warning("auth_exchange_failed", status_code=resp.status_code)
                return None
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error("auth_exchange_error", error=str(e))
            return None

        access_token = data.get("github_access_token")
        user_data = data.get("user")
        if not access_token or not user_data:
            logger.warning("auth_exchange_failed", reason="missing_token_or_user")
            return None

        session_id = create_session(access_token, user_data)
        logger.info("auth_login_success", user_id=str(user_data.get("id", "")))
        return session_id

    async def refresh_token(self, session: SessionData) -> str | None:
        """Ask registry for a fresh GH token using the stored github_id.

        Returns a new session_id if successful, or None.
        """
        github_id = session.user.get("id")
        if not github_id:
            return None

        registry_url = settings.REGISTRY_URL.rstrip("/")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{registry_url}/auth/refresh",
                    json={"github_id": github_id},
                    timeout=10,
                )
            if resp.status_code != 200:
                logger.warning("auth_refresh_failed", status_code=resp.status_code)
                return None
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error("auth_refresh_error", error=str(e))
            return None

        access_token = data.get("github_access_token")
        user_data = data.get("user")
        if not access_token or not user_data:
            return None

        session_id = create_session(access_token, user_data)
        logger.info("auth_token_refreshed", user_id=str(user_data.get("id", "")))
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
