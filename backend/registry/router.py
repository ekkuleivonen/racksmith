"""Registry proxy and push/import endpoints."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from github.managers import auth_manager

from registry import managers

router = APIRouter()


def _handle_registry_error(exc: Exception) -> None:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/roles")
async def list_roles(
    racksmith_version: str = Query(...),
    q: str | None = Query(None),
    tags: str | None = Query(None),
    owner: str | None = Query(None),
    sort: str = Query("recent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session=Depends(auth_manager.get_current_session),
):
    """Search and browse roles in the community registry."""
    return await managers.list_roles(
        session,
        racksmith_version=racksmith_version,
        q=q,
        tags=tags,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )


@router.get("/roles/{slug}")
async def get_role(
    slug: str,
    session=Depends(auth_manager.get_current_session),
):
    """Get a single registry role by slug."""
    try:
        return await managers.get_role(session, slug)
    except Exception as e:
        _handle_registry_error(e)


@router.get("/roles/{slug}/versions")
async def get_versions(
    slug: str,
    session=Depends(auth_manager.get_current_session),
):
    """List all published versions of a registry role."""
    try:
        return await managers.get_versions(session, slug)
    except Exception as e:
        _handle_registry_error(e)


@router.post("/roles/{slug}/push")
async def push_role(
    slug: str,
    session=Depends(auth_manager.get_current_session),
):
    """Push a local role to the community registry."""
    try:
        return await managers.push_role(session, slug)
    except Exception as e:
        _handle_registry_error(e)


@router.post("/roles/{slug}/import")
async def import_role(
    slug: str,
    session=Depends(auth_manager.get_current_session),
):
    """Import a role from the registry into the active repo."""
    try:
        return await managers.import_role(session, slug)
    except Exception as e:
        _handle_registry_error(e)


@router.delete("/roles/{slug}", status_code=204)
async def delete_role(
    slug: str,
    session=Depends(auth_manager.get_current_session),
):
    """Delete a role from the community registry."""
    try:
        await managers.delete_role(session, slug)
    except Exception as e:
        _handle_registry_error(e)
