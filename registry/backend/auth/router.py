"""Registry-mediated GitHub OAuth for Racksmith clients.

Flow:
  1. Client backend redirects user to GET /auth/login?callback_url=...&state=...
  2. Registry redirects to GitHub OAuth
  3. GitHub calls back to GET /auth/callback
  4. Registry exchanges code for GH token, upserts user, generates one-time exchange code
  5. Registry redirects to client's callback_url with exchange_code + state
  6. Client backend calls POST /auth/exchange to get the GH token + user profile
  7. Client backend can later call POST /auth/refresh to get a fresh token
"""

from __future__ import annotations

import hashlib
import secrets
import time
from urllib.parse import urlencode, urlparse

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

import settings
from auth.crypto import decrypt_token, encrypt_token
from db.engine import get_db
from db.models import RefreshToken, User

logger = structlog.get_logger(__name__)

router = APIRouter()

EXCHANGE_CODE_TTL = 120  # seconds

_pending_logins: dict[str, dict] = {}
_exchange_codes: dict[str, dict] = {}


def _validate_callback_url(url: str) -> None:
    """Reject callback URLs whose origin isn't in ALLOWED_ORIGINS."""
    if not settings.ALLOWED_ORIGINS:
        return
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in settings.ALLOWED_ORIGINS:
        raise HTTPException(status_code=400, detail="Disallowed callback URL origin")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cleanup_expired() -> None:
    """Remove expired pending logins and exchange codes."""
    now = time.monotonic()
    for store in (_pending_logins, _exchange_codes):
        expired = [k for k, v in store.items() if now - v.get("created_at", 0) > EXCHANGE_CODE_TTL]
        for k in expired:
            store.pop(k, None)


class ExchangeRequest(BaseModel):
    exchange_code: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: int
    login: str
    avatar_url: str
    name: str | None = None
    email: str | None = None

    model_config = {"extra": "ignore"}


class ExchangeResponse(BaseModel):
    github_access_token: str
    user: UserProfile
    refresh_token: str


class RefreshResponse(BaseModel):
    github_access_token: str
    user: UserProfile
    refresh_token: str


@router.get("/auth/login")
async def auth_login(callback_url: str, state: str) -> RedirectResponse:
    """Entry point from a Racksmith client. Redirects to GitHub OAuth."""
    _cleanup_expired()
    _validate_callback_url(callback_url)

    registry_state = secrets.token_urlsafe(32)
    _pending_logins[registry_state] = {
        "callback_url": callback_url,
        "client_state": state,
        "created_at": time.monotonic(),
    }

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": f"{_self_url()}/auth/callback",
        "scope": settings.GITHUB_OAUTH_SCOPES,
        "state": registry_state,
    }
    github_url = f"{settings.GITHUB_OAUTH_BASE}/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url=github_url)


@router.get("/auth/callback")
async def auth_callback(
    code: str | None = None,
    state: str | None = None,
    session: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """GitHub redirects here after user authorises."""
    if not code or not state or state not in _pending_logins:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    pending = _pending_logins.pop(state)
    callback_url = pending["callback_url"]
    client_state = pending["client_state"]

    access_token = await _exchange_github_code(code)
    if not access_token:
        logger.warning("auth_callback_failed", reason="github_token_exchange_failed")
        return RedirectResponse(url=callback_url)

    gh_user = await _fetch_github_user(access_token)
    if not gh_user:
        logger.warning("auth_callback_failed", reason="github_user_fetch_failed")
        return RedirectResponse(url=callback_url)

    await _upsert_user_with_token(session, gh_user, access_token)

    exchange_code = secrets.token_urlsafe(48)
    _exchange_codes[exchange_code] = {
        "github_access_token": access_token,
        "user": {
            "id": gh_user["id"],
            "login": gh_user.get("login", ""),
            "avatar_url": gh_user.get("avatar_url", ""),
            "name": gh_user.get("name"),
            "email": gh_user.get("email"),
        },
        "created_at": time.monotonic(),
    }

    separator = "&" if "?" in callback_url else "?"
    redirect = f"{callback_url}{separator}exchange_code={exchange_code}&state={client_state}"
    logger.info("auth_callback_success", github_id=gh_user["id"], username=gh_user.get("login"))
    return RedirectResponse(url=redirect)


@router.post("/auth/exchange", response_model=ExchangeResponse)
async def auth_exchange(
    body: ExchangeRequest,
    session: AsyncSession = Depends(get_db),
) -> ExchangeResponse:
    """Client backend exchanges a one-time code for the GH token + user profile + refresh token."""
    _cleanup_expired()

    data = _exchange_codes.pop(body.exchange_code, None)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired exchange code")

    if time.monotonic() - data["created_at"] > EXCHANGE_CODE_TTL:
        raise HTTPException(status_code=401, detail="Exchange code expired")

    refresh_token = secrets.token_urlsafe(48)
    github_id = data["user"]["id"]
    result = await session.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()
    if user:
        session.add(RefreshToken(user_id=user.id, token_hash=_hash_token(refresh_token)))
        await session.commit()

    return ExchangeResponse(
        github_access_token=data["github_access_token"],
        user=UserProfile.model_validate(data["user"]),
        refresh_token=refresh_token,
    )


@router.post("/auth/refresh", response_model=RefreshResponse)
async def auth_refresh(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    """Return the stored GH token for a user, authenticated by refresh token.

    Each call rotates the refresh token — the old one is invalidated and a
    new one is returned.
    """
    token_hash = _hash_token(body.refresh_token)
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user_result = await session.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.github_access_token_enc:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    gh_token = decrypt_token(user.github_access_token_enc)
    if not gh_token:
        raise HTTPException(status_code=404, detail="Stored token is invalid or corrupted")

    new_refresh_token = secrets.token_urlsafe(48)
    await session.delete(rt)
    session.add(RefreshToken(user_id=user.id, token_hash=_hash_token(new_refresh_token)))
    user.last_seen = func.now()
    await session.commit()

    return RefreshResponse(
        github_access_token=gh_token,
        user=UserProfile(
            id=user.github_id,
            login=user.username,
            avatar_url=user.avatar_url,
        ),
        refresh_token=new_refresh_token,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _self_url() -> str:
    """Public URL of this registry instance (used as OAuth redirect_uri base)."""
    return settings.REGISTRY_PUBLIC_URL.rstrip("/")


async def _exchange_github_code(code: str) -> str | None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.GITHUB_OAUTH_BASE}/login/oauth/access_token",
            params={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
    data = resp.json()
    return data.get("access_token")


async def _fetch_github_user(access_token: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.GITHUB_API_BASE}/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        return None
    return resp.json()


async def _upsert_user_with_token(
    session: AsyncSession, gh_user: dict, access_token: str
) -> User:
    result = await session.execute(
        select(User).where(User.github_id == gh_user["id"])
    )
    user = result.scalar_one_or_none()

    encrypted = encrypt_token(access_token)

    if user is None:
        user = User(
            github_id=gh_user["id"],
            username=gh_user["login"],
            avatar_url=gh_user.get("avatar_url", ""),
            github_access_token_enc=encrypted,
            last_seen=func.now(),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info("auth_user_created", username=user.username)
    else:
        user.username = gh_user["login"]
        user.avatar_url = gh_user.get("avatar_url", "")
        user.github_access_token_enc = encrypted
        user.last_seen = func.now()
        await session.commit()
        logger.info("auth_user_updated", username=user.username)

    return user
