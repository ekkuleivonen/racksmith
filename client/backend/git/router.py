"""Git working-tree operations — action namespace under /api/git."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from auth.dependencies import CurrentSession
from repo.files import files_manager
from repo.files_schemas import CommitRequest, CommitResponse, DiffsResponse, FileStatusesResponse
from repo.managers import repos_manager
from repo.schemas import StatusMessageResponse

router = APIRouter()


@router.get("/diffs", response_model=DiffsResponse)
async def get_diffs(session: CurrentSession) -> DiffsResponse:
    """Get unified diffs for all uncommitted changes."""
    files = await files_manager.get_diffs(session)
    return DiffsResponse(files=files)


@router.get("/status", response_model=FileStatusesResponse)
async def get_file_statuses(session: CurrentSession) -> FileStatusesResponse:
    """Get modified and untracked file paths in the working tree."""
    statuses = await files_manager.get_file_statuses(session)
    return FileStatusesResponse(
        modified_paths=statuses["modified"],
        untracked_paths=statuses["untracked"],
    )


@router.post("/commit", response_model=CommitResponse)
async def commit(body: CommitRequest, session: CurrentSession) -> CommitResponse:
    """Commit and push all changes, returning the PR URL."""
    pr_url = await files_manager.commit_and_push(session, body.message)
    return CommitResponse(status="pushed", pr_url=pr_url)


@router.post("/discard", status_code=204)
async def discard(session: CurrentSession) -> None:
    """Discard all uncommitted changes in the working tree."""
    await files_manager.discard_changes(session)


@router.post("/sync", response_model=StatusMessageResponse)
async def sync_repo(session: CurrentSession) -> StatusMessageResponse:
    """Pull latest changes from the remote racksmith branch."""
    try:
        await repos_manager.sync_repo(session)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StatusMessageResponse(status="ok")
