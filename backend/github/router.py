"""GitHub router: OAuth, repos, file tree, content, PRs."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

import settings
from github.managers import auth_manager, repo_manager
from github.schemas import CloneRequest, CreatePrRequest, UpdateFileRequest

# ---------------------------------------------------------------------------
# Auth router  (/api/auth)
# ---------------------------------------------------------------------------

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

    if not session_id:
        return RedirectResponse(url=settings.APP_URL, status_code=302)

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
    response = RedirectResponse(url=settings.APP_URL, status_code=302)
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response


# ---------------------------------------------------------------------------
# Repos router  (/api/repos)
# ---------------------------------------------------------------------------

router = APIRouter()


@router.get("")
async def list_repos(session=Depends(auth_manager.get_current_session)):
    try:
        repos = await repo_manager.list_repos(session.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repos": repos}


@router.post("/clone")
async def clone_repo(
    body: CloneRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        result = repo_manager.clone_repo(
            body.owner, body.repo, session.access_token
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result


@router.get("/cloned")
async def list_cloned(session=Depends(auth_manager.get_current_session)):
    return {"cloned": repo_manager.list_cloned()}


@router.get("/{owner}/{repo}/tree")
async def get_tree(
    owner: str, repo: str, session=Depends(auth_manager.get_current_session)
):
    try:
        entries = repo_manager.get_tree(owner, repo)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Repo not cloned")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"entries": entries}


@router.get("/{owner}/{repo}/file")
async def get_file(
    owner: str,
    repo: str,
    path: str,
    session=Depends(auth_manager.get_current_session),
):
    try:
        content = repo_manager.get_file(owner, repo, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"content": content}


@router.get("/{owner}/{repo}/file-statuses")
async def get_file_statuses(
    owner: str, repo: str, session=Depends(auth_manager.get_current_session)
):
    try:
        paths = repo_manager.get_file_statuses(owner, repo)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Repo not cloned")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"modified_paths": paths}


@router.put("/{owner}/{repo}/file")
async def update_file(
    owner: str,
    repo: str,
    body: UpdateFileRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        repo_manager.update_file(owner, repo, body.path, body.content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "updated"}


@router.post("/{owner}/{repo}/pull-request")
async def create_pull_request(
    owner: str,
    repo: str,
    body: CreatePrRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        result = await repo_manager.create_pull_request(
            owner, repo, body.title, body.message, session.access_token
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Repo not cloned")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result
