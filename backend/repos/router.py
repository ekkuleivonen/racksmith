"""Repos API: list, activate, create, drop, status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from nodes.managers import node_manager
from repos.managers import repos_manager
from repos.schemas import RepoActivationRequest, RepoCreateRequest, RepoSelectionRequest

router = APIRouter()


@router.get("/status")
async def get_status(session=Depends(auth_manager.get_current_session)):
    nodes = node_manager.list_nodes(session)
    return repos_manager.status(
        session, nodes_ready=len(nodes) > 0
    )


@router.get("/repos")
async def list_repos(session=Depends(auth_manager.get_current_session)):
    try:
        repos = await repos_manager.list_repos(session.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repos": repos}


@router.get("/local-repos")
async def list_local_repos(session=Depends(auth_manager.get_current_session)):
    return {"repos": repos_manager.list_local_repos(session)}


@router.post("/repos/select")
async def select_repo(
    body: RepoSelectionRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        repo = repos_manager.activate_repo(session, owner=body.owner, repo=body.repo)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repo": repo}


@router.post("/local-repos/activate")
async def activate_local_repo(
    body: RepoActivationRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        repo = repos_manager.activate_local_repo(
            session, owner=body.owner, repo=body.repo
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"repo": repo}


@router.delete("/local-repos/{owner}/{repo}", status_code=204)
async def drop_local_repo(
    owner: str, repo: str, session=Depends(auth_manager.get_current_session)
):
    try:
        repos_manager.drop_repo(session, owner=owner, repo=repo)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/repos/create", status_code=201)
async def create_repo(
    body: RepoCreateRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        created = await repos_manager.create_repo(
            session.access_token, body.name.strip(), private=body.private
        )
        repo = repos_manager.activate_repo(
            session, owner=created["owner"], repo=created["name"]
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repo": repo}


@router.get("/repo")
async def get_active_repo(session=Depends(auth_manager.get_current_session)):
    binding = repos_manager.current_repo(session)
    if not binding:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    return {"repo": repos_manager.serialize_binding(binding)}
