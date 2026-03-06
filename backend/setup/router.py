"""Setup endpoints for first-run repo provisioning."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from racks.managers import rack_manager
from setup.managers import setup_manager
from setup.schemas import RepoActivationRequest, RepoCreateRequest, RepoSelectionRequest

router = APIRouter()


@router.get("/status")
async def get_status(session=Depends(auth_manager.get_current_session)):
    return setup_manager.status(
        session, rack_ready=rack_manager.has_ready_rack_for_session(session)
    )


@router.get("/repos")
async def list_repos(session=Depends(auth_manager.get_current_session)):
    try:
        repos = await setup_manager.list_repos(session.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repos": repos}


@router.get("/local-repos")
async def list_local_repos(session=Depends(auth_manager.get_current_session)):
    return {"repos": setup_manager.list_local_repos(session)}


@router.post("/repos/select")
async def select_repo(
    body: RepoSelectionRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        await setup_manager.ensure_repo_is_importable(
            session.access_token, body.owner, body.repo
        )
        repo = setup_manager.activate_repo(session, owner=body.owner, repo=body.repo)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"repo": repo}


@router.post("/local-repos/activate")
async def activate_local_repo(
    body: RepoActivationRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        repo = setup_manager.activate_local_repo(
            session, owner=body.owner, repo=body.repo
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"repo": repo}


@router.post("/repos/create", status_code=201)
async def create_repo(
    body: RepoCreateRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        created = await setup_manager.create_repo(
            session.access_token, body.name.strip(), private=body.private
        )
        repo = setup_manager.activate_repo(
            session, owner=created["owner"], repo=created["name"]
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repo": repo}


@router.get("/repo")
async def get_active_repo(session=Depends(auth_manager.get_current_session)):
    binding = setup_manager.current_repo(session)
    if not binding:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    return {"repo": setup_manager.serialize_binding(binding)}
