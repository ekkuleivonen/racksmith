"""Group REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from groups.managers import group_manager
from groups.schemas import GroupInput

router = APIRouter()


@router.get("")
async def list_groups(session=Depends(auth_manager.get_current_session)):
    return {"groups": group_manager.list_groups(session)}


@router.post("", status_code=201)
async def create_group(body: GroupInput, session=Depends(auth_manager.get_current_session)):
    try:
        group = group_manager.create_group(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"group": group, "slug": group.slug}


@router.get("/{slug}")
async def get_group(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        group = group_manager.get_group(session, slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"group": group}


@router.patch("/{slug}")
async def update_group(
    slug: str, body: GroupInput, session=Depends(auth_manager.get_current_session)
):
    try:
        group = group_manager.update_group(session, slug, body)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"group": group}


@router.delete("/{slug}", status_code=204)
async def delete_group(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        group_manager.delete_group(session, slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
