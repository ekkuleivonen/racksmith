"""Auth router: GitHub OAuth login, callback, me, logout."""

import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import RedirectResponse

import settings
from auth.session import create_session, delete_session, get_current_user

router = APIRouter()

# Short-lived state storage for OAuth CSRF protection (state -> valid)
_oauth_states: dict[str, bool] = {}


@router.get("/login")
async def login(request: Request):
    """Redirect to GitHub authorization URL."""
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = True

    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/auth/callback"

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": settings.GITHUB_OAUTH_SCOPES,
        "state": state,
    }
    github_auth_url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url=github_auth_url)


@router.get("/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
):
    """Exchange code for token, create session, redirect to app."""
    if not code or not state or state not in _oauth_states:
        return RedirectResponse(url=settings.APP_URL, status_code=302)
    del _oauth_states[state]

    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/auth/callback"

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            params={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(url=settings.APP_URL, status_code=302)

    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if user_resp.status_code != 200:
        return RedirectResponse(url=settings.APP_URL, status_code=302)

    user = user_resp.json()
    session_id = create_session(access_token, user)

    response = RedirectResponse(url=settings.APP_URL, status_code=302)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_id,
        max_age=settings.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return response


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    """Return current authenticated user."""
    return {"user": user}


@router.post("/logout")
async def logout(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Clear session and redirect to app."""
    delete_session(session_id)
    response = RedirectResponse(url=settings.APP_URL, status_code=302)
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response
