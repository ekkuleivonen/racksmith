"""Repo API: repo lifecycle, file operations, diffs, commit/push."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from auth.dependencies import CurrentSession
from hosts.managers import host_manager
from repo.files import files_manager
from repo.files_schemas import (
    CreateFolderRequest,
    FileContentResponse,
    FileUpdate,
    MoveEntryRequest,
    TreeResponse,
)
from repo.files_schemas import (
    StatusMessageResponse as FilesStatusMessageResponse,
)
from repo.import_ansible import detect_ansible, import_ansible
from repo.managers import repos_manager
from repo.schemas import (
    DetectedResponse,
    ImportAnsibleRequest,
    ImportSummaryResponse,
    LocalRepoListResponse,
    RepoActivation,
    RepoCreate,
    RepoListResponse,
    RepoResponse,
    RepoSelection,
    SetupStatus,
)

repos_router = APIRouter()


@repos_router.get("/status", response_model=SetupStatus)
async def get_status(session: CurrentSession) -> SetupStatus:
    """Return setup status: user info, active repo, hosts ready flag."""
    hosts = host_manager.list_hosts(session)
    return repos_manager.status(session, hosts_ready=len(hosts) > 0)


@repos_router.get("", response_model=RepoListResponse)
async def list_repos(session: CurrentSession) -> RepoListResponse:
    """List user's GitHub repositories (from GitHub API)."""
    try:
        repos = await repos_manager.list_repos(session.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RepoListResponse(repos=repos)


@repos_router.get("/local-repos", response_model=LocalRepoListResponse)
async def list_local_repos(session: CurrentSession) -> LocalRepoListResponse:
    """List repos cloned in the workspace on this server."""
    return LocalRepoListResponse(repos=await repos_manager.list_local_repos(session))


@repos_router.post("/select", response_model=RepoResponse)
async def select_repo(
    body: RepoSelection, session: CurrentSession
) -> RepoResponse:
    """Clone or activate a GitHub repo for Racksmith. Creates racksmith branch if needed."""
    try:
        repo = await repos_manager.activate_repo(session, owner=body.owner, repo=body.repo)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RepoResponse(repo=repo)


@repos_router.post("/local-repos/activate", response_model=RepoResponse)
async def activate_local_repo(
    body: RepoActivation, session: CurrentSession
) -> RepoResponse:
    """Activate an existing local clone as the current repo."""
    repo = await repos_manager.activate_local_repo(
        session, owner=body.owner, repo=body.repo
    )
    return RepoResponse(repo=repo)


@repos_router.delete("/local-repos/{owner}/{repo}", status_code=204)
async def drop_local_repo(
    owner: str, repo: str, session: CurrentSession
) -> None:
    """Remove a local repo clone from the workspace."""
    repos_manager.drop_repo(session, owner=owner, repo=repo)


@repos_router.post("", status_code=201, response_model=RepoResponse)
async def create_repo(
    body: RepoCreate, session: CurrentSession
) -> RepoResponse:
    """Create a new GitHub repo and activate it for Racksmith."""
    try:
        created = await repos_manager.create_repo(
            session.access_token, body.name.strip(), private=body.private
        )
        repo = await repos_manager.activate_repo(
            session, owner=created.owner, repo=created.name
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RepoResponse(repo=repo)


@repos_router.post("/detect-ansible", response_model=DetectedResponse)
async def detect_ansible_resources(
    session: CurrentSession,
) -> DetectedResponse:
    """Scan active repo for existing Ansible resources (inventory, roles, playbooks)."""
    repo_path = repos_manager.active_repo_path(session)
    detected = detect_ansible(repo_path)
    return DetectedResponse(detected=detected)


@repos_router.post("/import-ansible", response_model=ImportSummaryResponse)
async def import_ansible_resources(
    body: ImportAnsibleRequest, session: CurrentSession
) -> ImportSummaryResponse:
    """Import existing Ansible resources from given paths into .racksmith/."""
    repo_path = repos_manager.active_repo_path(session)
    summary = import_ansible(
        repo_path,
        inventory_path=body.inventory_path,
        roles_path=body.roles_path,
        playbooks_path=body.playbooks_path,
        host_vars_path=body.host_vars_path,
        group_vars_path=body.group_vars_path,
    )
    return ImportSummaryResponse(summary=summary)


files_router = APIRouter()


@files_router.get("/tree", response_model=TreeResponse)
async def get_tree(session: CurrentSession) -> TreeResponse:
    """Get the file tree of the active repo."""
    entries = files_manager.get_tree(session)
    return TreeResponse(entries=entries)


@files_router.get("/file", response_model=FileContentResponse)
async def get_file(path: str, session: CurrentSession) -> FileContentResponse:
    """Read the contents of a single file."""
    content = files_manager.get_file(session, path)
    return FileContentResponse(content=content)


@files_router.put("/file", response_model=FilesStatusMessageResponse)
async def update_file(
    body: FileUpdate, session: CurrentSession
) -> FilesStatusMessageResponse:
    """Update an existing file's contents."""
    files_manager.update_file(session, body.path, body.content)
    return FilesStatusMessageResponse(status="updated")


@files_router.post("/file", status_code=201, response_model=FilesStatusMessageResponse)
async def create_file(
    body: FileUpdate, session: CurrentSession
) -> FilesStatusMessageResponse:
    """Create a new file in the repo."""
    files_manager.create_file(session, body.path, body.content)
    return FilesStatusMessageResponse(status="created")


@files_router.delete("/file", status_code=204)
async def delete_file(
    path: str, session: CurrentSession
) -> None:
    """Delete a file from the repo."""
    files_manager.delete_file(session, path)


@files_router.post("/folder", status_code=201, response_model=FilesStatusMessageResponse)
async def create_folder(
    body: CreateFolderRequest, session: CurrentSession
) -> FilesStatusMessageResponse:
    """Create a new directory in the repo."""
    files_manager.create_folder(session, body.path)
    return FilesStatusMessageResponse(status="created")


@files_router.delete("/folder", status_code=204)
async def delete_folder(
    path: str, session: CurrentSession
) -> None:
    """Delete a directory from the repo."""
    files_manager.delete_folder(session, path)


@files_router.patch("/move", status_code=200, response_model=FilesStatusMessageResponse)
async def move_entry(
    body: MoveEntryRequest, session: CurrentSession
) -> FilesStatusMessageResponse:
    """Move or rename a file or directory."""
    files_manager.move_entry(session, body.src, body.dest)
    return FilesStatusMessageResponse(status="moved")
