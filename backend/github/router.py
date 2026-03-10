"""Auth router — registry-mediated GitHub OAuth."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse

import settings
from github.managers import auth_manager

auth_router = APIRouter()


@auth_router.get("/login")
async def login(request: Request):
    """Redirect to registry's OAuth entry point (which redirects to GitHub)."""
    callback_url = f"{settings.APP_URL.rstrip('/')}/api/auth/registry-callback"
    return RedirectResponse(url=auth_manager.get_registry_login_url(callback_url))


@auth_router.get("/registry-callback")
async def registry_callback(
    request: Request,
    exchange_code: str | None = None,
    state: str | None = None,
):
    """Handle redirect back from registry after GitHub OAuth.

    Registry provides a one-time exchange_code that we trade for the
    GH access token and user profile.
    """
    redirect_url = f"{settings.APP_URL.rstrip('/')}/setup"
    response = RedirectResponse(url=redirect_url, status_code=302)

    if not auth_manager.validate_state(state):
        return response

    if not exchange_code:
        return response

    session_id = await auth_manager.exchange_code(exchange_code)
    if not session_id:
        return response

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_id,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return response


@auth_router.get("/me")
async def me(user: dict = Depends(auth_manager.get_current_user)):
    """Return the currently authenticated user's profile."""
    return {"user": user}


@auth_router.post("/refresh")
async def refresh(
    request: Request,
    session=Depends(auth_manager.get_current_session),
    session_id: str | None = Cookie(
        default=None, alias=settings.SESSION_COOKIE_NAME
    ),
):
    """Refresh the session by fetching a fresh GH token from registry.

    The old session is destroyed and a new one is created.
    """
    new_session_id = await auth_manager.refresh_token(session)
    if not new_session_id:
        return JSONResponse({"status": "refresh_failed"}, status_code=502)

    auth_manager.logout(session_id)

    response = JSONResponse({"status": "refreshed"})
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=new_session_id,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return response


@auth_router.post("/logout")
async def logout(
    request: Request,
    session_id: str | None = Cookie(
        default=None, alias=settings.SESSION_COOKIE_NAME
    ),
):
    """Destroy the current session and clear the cookie."""
    auth_manager.logout(session_id)
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response
