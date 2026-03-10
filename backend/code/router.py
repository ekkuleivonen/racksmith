"""Code API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from code.managers import code_manager
from code.schemas import (
    CommitRequest,
    CreateFolderRequest,
    MoveEntryRequest,
    UpdateCodeFileRequest,
)
from github.managers import auth_manager

router = APIRouter()


@router.get("/tree")
async def get_tree(session=Depends(auth_manager.get_current_session)):
    """Get the file tree of the active repo."""
    try:
        entries = code_manager.get_tree(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    return {"entries": entries}


@router.get("/file")
async def get_file(path: str, session=Depends(auth_manager.get_current_session)):
    """Read the contents of a single file."""
    try:
        content = code_manager.get_file(session, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"content": content}


@router.get("/diffs")
async def get_diffs(session=Depends(auth_manager.get_current_session)):
    """Get unified diffs for all uncommitted changes."""
    try:
        files = code_manager.get_diffs(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"files": files}


@router.get("/file-statuses")
async def get_file_statuses(session=Depends(auth_manager.get_current_session)):
    """Get modified and untracked file paths in the working tree."""
    try:
        statuses = code_manager.get_file_statuses(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "modified_paths": statuses["modified"],
        "untracked_paths": statuses["untracked"],
    }


@router.put("/file")
async def update_file(
    body: UpdateCodeFileRequest, session=Depends(auth_manager.get_current_session)
):
    """Update an existing file's contents."""
    try:
        code_manager.update_file(session, body.path, body.content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "updated"}


@router.post("/file", status_code=201)
async def create_file(
    body: UpdateCodeFileRequest, session=Depends(auth_manager.get_current_session)
):
    """Create a new file in the repo."""
    try:
        code_manager.create_file(session, body.path, body.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "created"}


@router.delete("/file", status_code=204)
async def delete_file(
    path: str, session=Depends(auth_manager.get_current_session)
):
    """Delete a file from the repo."""
    try:
        code_manager.delete_file(session, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/folder", status_code=201)
async def create_folder(
    body: CreateFolderRequest, session=Depends(auth_manager.get_current_session)
):
    """Create a new directory in the repo."""
    try:
        code_manager.create_folder(session, body.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "created"}


@router.delete("/folder", status_code=204)
async def delete_folder(
    path: str, session=Depends(auth_manager.get_current_session)
):
    """Delete a directory from the repo."""
    try:
        code_manager.delete_folder(session, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/discard", status_code=204)
async def discard(session=Depends(auth_manager.get_current_session)):
    """Discard all uncommitted changes in the working tree."""
    try:
        code_manager.discard_changes(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/commit")
async def commit(
    body: CommitRequest, session=Depends(auth_manager.get_current_session)
):
    """Commit and push all changes, returning the PR URL."""
    try:
        pr_url = code_manager.commit_and_push(session, body.message)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "pushed", "pr_url": pr_url}


@router.patch("/move", status_code=200)
async def move_entry(
    body: MoveEntryRequest, session=Depends(auth_manager.get_current_session)
):
    """Move or rename a file or directory."""
    try:
        code_manager.move_entry(session, body.src, body.dest)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "moved"}
