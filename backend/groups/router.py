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
    return {"group": group, "group_id": group.id}


@router.get("/{group_id}")
async def get_group(group_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        group = group_manager.get_group(session, group_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"group": group}


@router.patch("/{group_id}")
async def update_group(
    group_id: str, body: GroupInput, session=Depends(auth_manager.get_current_session)
):
    try:
        group = group_manager.update_group(session, group_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"group": group}


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        group_manager.delete_group(session, group_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Group not found")
