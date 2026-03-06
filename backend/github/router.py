"""GitHub auth router."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse

import settings
from github.managers import auth_manager

auth_router = APIRouter()


@auth_router.get("/login")
async def login(request: Request):
    redirect_uri = f"{str(request.base_url).rstrip('/')}/api/auth/callback"
    return RedirectResponse(url=auth_manager.get_login_url(redirect_uri))


@auth_router.get("/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
):
    redirect_uri = f"{str(request.base_url).rstrip('/')}/api/auth/callback"
    session_id = await auth_manager.handle_callback(code, state, redirect_uri)

    response = RedirectResponse(url=settings.APP_URL, status_code=302)
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
    return {"user": user}


@auth_router.post("/logout")
async def logout(
    request: Request,
    session_id: str | None = Cookie(
        default=None, alias=settings.SESSION_COOKIE_NAME
    ),
):
    auth_manager.logout(session_id)
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response
