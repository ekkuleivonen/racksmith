"""Auth router — registry-mediated GitHub OAuth."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

import settings
from _utils.logging import get_logger
from _utils.schemas import StatusMessageResponse
from auth.dependencies import CurrentSession, CurrentUser
from auth.managers import auth_manager
from auth.schemas import UserInfo, UserResponse

logger = get_logger(__name__)
auth_router = APIRouter()


def _is_secure(request: Request) -> bool:
    """Detect HTTPS even behind reverse proxies (cloudflared, nginx)."""
    if settings.APP_URL.startswith("https"):
        return True
    if request.headers.get("x-forwarded-proto") == "https":
        return True
    return request.url.scheme == "https"


@auth_router.get("/login")
async def login(request: Request) -> RedirectResponse:
    """Redirect to registry's OAuth entry point (which redirects to GitHub)."""
    callback_url = f"{settings.APP_URL.rstrip('/')}/api/auth/registry-callback"
    return RedirectResponse(url=auth_manager.get_registry_login_url(callback_url))


@auth_router.get("/registry-callback")
async def registry_callback(
    request: Request,
    exchange_code: str | None = None,
    state: str | None = None,
) -> RedirectResponse:
    """Handle redirect back from registry after GitHub OAuth.

    Registry provides a one-time exchange_code that we trade for the
    GH access token and user profile.
    """
    redirect_url = settings.APP_URL.rstrip("/")
    response = RedirectResponse(url=redirect_url, status_code=302)

    if not auth_manager.validate_state(state):
        logger.warning("registry_callback_bad_state", state_present=bool(state))
        return response

    if not exchange_code:
        logger.warning("registry_callback_no_code")
        return response

    session_id = await auth_manager.exchange_code(exchange_code)
    if not session_id:
        logger.warning("registry_callback_exchange_failed")
        return response

    logger.info("registry_callback_success", secure=_is_secure(request))
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_id,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_is_secure(request),
    )
    return response


@auth_router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    """Return the currently authenticated user's profile."""
    return UserResponse(user=UserInfo.model_validate(user))


@auth_router.post("/refresh")
async def refresh(
    request: Request,
    session: CurrentSession,
    session_id: str | None = Cookie(
        default=None, alias=settings.SESSION_COOKIE_NAME
    ),
) -> JSONResponse:
    """Refresh the session by fetching a fresh GH token from registry.

    The old session is destroyed and a new one is created.
    """
    new_session_id = await auth_manager.refresh_token(session)
    if not new_session_id:
        raise HTTPException(status_code=502, detail="Token refresh failed")

    await auth_manager.logout(session_id)

    body = StatusMessageResponse(status="refreshed", message="Session refreshed").model_dump(
        mode="json"
    )
    response = JSONResponse(body)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=new_session_id,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_is_secure(request),
    )
    return response


@auth_router.post("/logout")
async def logout(
    request: Request,
    session_id: str | None = Cookie(
        default=None, alias=settings.SESSION_COOKIE_NAME
    ),
) -> JSONResponse:
    """Destroy the current session and clear the cookie."""
    await auth_manager.logout(session_id)
    response = JSONResponse(
        StatusMessageResponse(status="logged_out", message="Logged out").model_dump(mode="json")
    )
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response
