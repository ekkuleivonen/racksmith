"""Code API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from code.managers import code_manager
from code.schemas import UpdateCodeFileRequest
from github.managers import auth_manager

router = APIRouter()


@router.get("/tree")
async def get_tree(session=Depends(auth_manager.get_current_session)):
    try:
        entries = code_manager.get_tree(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Active repo is not configured")
    return {"entries": entries}


@router.get("/file")
async def get_file(path: str, session=Depends(auth_manager.get_current_session)):
    try:
        content = code_manager.get_file(session, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"content": content}


@router.get("/file-statuses")
async def get_file_statuses(session=Depends(auth_manager.get_current_session)):
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
    try:
        code_manager.update_file(session, body.path, body.content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "updated"}
