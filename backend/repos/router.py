"""Repos API: list, activate, create, drop, status, detect/import Ansible."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from hosts.managers import host_manager
from repos.import_ansible import detect_ansible, import_ansible
from repos.managers import repos_manager
from repos.schemas import (
    DetectedAnsiblePaths,
    ImportAnsibleRequest,
    ImportAnsibleSummary,
    RepoActivationRequest,
    RepoCreateRequest,
    RepoSelectionRequest,
)

router = APIRouter()


@router.get("/status")
async def get_status(session=Depends(auth_manager.get_current_session)):
    """Return setup status: user info, active repo, hosts ready flag."""
    hosts = host_manager.list_hosts(session)
    return repos_manager.status(
        session, hosts_ready=len(hosts) > 0
    )


@router.get("/repos")
async def list_repos(session=Depends(auth_manager.get_current_session)):
    """List user's GitHub repositories (from GitHub API)."""
    try:
        repos = await repos_manager.list_repos(session.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repos": repos}


@router.get("/local-repos")
async def list_local_repos(session=Depends(auth_manager.get_current_session)):
    """List repos cloned in the workspace on this server."""
    return {"repos": repos_manager.list_local_repos(session)}


@router.post("/repos/select")
async def select_repo(
    body: RepoSelectionRequest, session=Depends(auth_manager.get_current_session)
):
    """Clone or activate a GitHub repo for Racksmith. Creates racksmith branch if needed."""
    try:
        repo = repos_manager.activate_repo(session, owner=body.owner, repo=body.repo)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"repo": repo}


@router.post("/local-repos/activate")
async def activate_local_repo(
    body: RepoActivationRequest, session=Depends(auth_manager.get_current_session)
):
    """Activate an existing local clone as the current repo."""
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
    """Remove a local repo clone from the workspace."""
    try:
        repos_manager.drop_repo(session, owner=owner, repo=repo)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/repos/create", status_code=201)
async def create_repo(
    body: RepoCreateRequest, session=Depends(auth_manager.get_current_session)
):
    """Create a new GitHub repo and activate it for Racksmith."""
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


@router.post("/sync")
async def sync_repo(session=Depends(auth_manager.get_current_session)):
    """Pull latest changes from the remote racksmith branch."""
    try:
        repos_manager.sync_repo(session)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.get("/repo")
async def get_active_repo(session=Depends(auth_manager.get_current_session)):
    """Return the currently active repo binding (owner, repo, path)."""
    binding = repos_manager.current_repo(session)
    if not binding:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    return {"repo": repos_manager.serialize_binding(binding)}


@router.post("/detect-ansible")
async def detect_ansible_resources(
    session=Depends(auth_manager.get_current_session),
):
    """Scan active repo for existing Ansible resources (inventory, roles, playbooks)."""
    try:
        repo_path = repos_manager.active_repo_path(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    detected = detect_ansible(repo_path)
    return {"detected": detected}


@router.post("/import-ansible")
async def import_ansible_resources(
    body: ImportAnsibleRequest, session=Depends(auth_manager.get_current_session)
):
    """Import existing Ansible resources from given paths into .racksmith/."""
    try:
        repo_path = repos_manager.active_repo_path(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    try:
        summary = import_ansible(
            repo_path,
            inventory_path=body.inventory_path,
            roles_path=body.roles_path,
            playbooks_path=body.playbooks_path,
            host_vars_path=body.host_vars_path,
            group_vars_path=body.group_vars_path,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"summary": summary}
