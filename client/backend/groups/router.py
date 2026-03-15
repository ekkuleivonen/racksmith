"""Group REST API router."""

from __future__ import annotations

from fastapi import APIRouter

from auth.dependencies import CurrentSession
from groups.managers import group_manager
from groups.schemas import (
    GroupCreate,
    GroupCreateResponse,
    GroupListResponse,
    GroupResponse,
    GroupUpdate,
    GroupWithMembersResponse,
)

router = APIRouter()


@router.get("", response_model=GroupListResponse)
async def list_groups(session: CurrentSession) -> GroupListResponse:
    """List all host groups in the active repo."""
    return GroupListResponse(groups=group_manager.list_groups(session))


@router.post("", status_code=201, response_model=GroupCreateResponse)
async def create_group(body: GroupCreate, session: CurrentSession) -> GroupCreateResponse:
    """Create a new host group."""
    group = group_manager.create_group(session, body)
    return GroupCreateResponse(group=group, group_id=group.id)


@router.get("/{group_id}", response_model=GroupWithMembersResponse)
async def get_group(group_id: str, session: CurrentSession) -> GroupWithMembersResponse:
    """Get a single group by ID."""
    group = group_manager.get_group(session, group_id)
    return GroupWithMembersResponse(group=group)


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: str, body: GroupUpdate, session: CurrentSession
) -> GroupResponse:
    """Update a group's name or variables."""
    group = group_manager.update_group(session, group_id, body)
    return GroupResponse(group=group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: str, session: CurrentSession) -> None:
    """Delete a group by ID."""
    group_manager.delete_group(session, group_id)
