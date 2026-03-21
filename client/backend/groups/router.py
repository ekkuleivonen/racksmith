"""Group REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Query

from _utils.pagination import paginate
from _utils.schemas import PaginatedResponse
from auth.dependencies import CurrentSession
from groups.managers import group_manager
from groups.schemas import (
    AddMembersRequest,
    Group,
    GroupCreate,
    GroupResponse,
    GroupUpdate,
    GroupWithMembers,
    GroupWithMembersResponse,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[Group])
async def list_groups(
    session: CurrentSession,
    q: str | None = Query(None, description="Search name or description"),
    sort: str = Query("name", description="Sort field: name, id, description"),
    order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[Group]:
    """List all host groups in the active repo."""
    rows = group_manager.list_groups_filtered(session, q=q, sort=sort, order=order)
    slice_rows, total = paginate(rows, page=page, per_page=per_page)
    return PaginatedResponse(items=slice_rows, total=total, page=page, per_page=per_page)


@router.post("", status_code=201, response_model=GroupWithMembersResponse)
async def create_group(body: GroupCreate, session: CurrentSession) -> GroupWithMembersResponse:
    """Create a new host group."""
    group = group_manager.create_group(session, body)
    return GroupWithMembersResponse(
        group=GroupWithMembers(**group.model_dump(), hosts=[]),
    )


@router.post("/{group_id}/members", status_code=201)
async def add_members(
    group_id: str, body: AddMembersRequest, session: CurrentSession
) -> None:
    """Add hosts to a group."""
    group_manager.add_members(session, group_id, body.host_ids)


@router.delete("/{group_id}/members/{host_id}", status_code=204)
async def remove_member(
    group_id: str, host_id: str, session: CurrentSession
) -> None:
    """Remove a host from a group."""
    group_manager.remove_member(session, group_id, host_id)


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
