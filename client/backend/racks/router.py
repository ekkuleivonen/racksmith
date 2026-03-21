"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Query

from _utils.pagination import paginate
from _utils.schemas import PaginatedResponse
from auth.dependencies import CurrentSession
from racks.managers import rack_manager
from racks.schemas import (
    RackCreate,
    RackLayout,
    RackLayoutResponse,
    RackResponse,
    RackSummary,
    RackUpdate,
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[RackLayout] | PaginatedResponse[RackSummary],
)
async def list_racks(
    session: CurrentSession,
    include: str | None = Query(
        None,
        description='Use "layout" to embed hosts per rack (avoids N+1 fetches)',
    ),
    q: str | None = Query(None, description="Search rack name"),
    sort: str = Query("name", description="Sort field: name, id, created_at"),
    order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[RackSummary] | PaginatedResponse[RackLayout]:
    """List all server racks in the active repo."""
    if include == "layout":
        layouts = rack_manager.list_rack_layouts_filtered(
            session, q=q, sort=sort, order=order
        )
        layout_page, total = paginate(layouts, page=page, per_page=per_page)
        return PaginatedResponse(
            items=layout_page, total=total, page=page, per_page=per_page
        )
    summaries = rack_manager.list_racks_filtered(session, q=q, sort=sort, order=order)
    summary_page, total = paginate(summaries, page=page, per_page=per_page)
    return PaginatedResponse(
        items=summary_page, total=total, page=page, per_page=per_page
    )


@router.post("", status_code=201, response_model=RackResponse)
async def create_rack(body: RackCreate, session: CurrentSession) -> RackResponse:
    """Create a new server rack."""
    rack = rack_manager.create_rack(session, body)
    return RackResponse(rack=rack)


@router.get("/{rack_id}", response_model=RackResponse)
async def get_rack(rack_id: str, session: CurrentSession) -> RackResponse:
    """Get a single rack by ID."""
    rack = rack_manager.get_rack(session, rack_id)
    return RackResponse(rack=rack)


@router.get("/{rack_id}/layout", response_model=RackLayoutResponse)
async def get_rack_layout(rack_id: str, session: CurrentSession) -> RackLayoutResponse:
    """Get the visual layout grid for a rack."""
    layout = rack_manager.get_layout(session, rack_id)
    return RackLayoutResponse(layout=layout)


@router.delete("/{rack_id}/hosts", status_code=204)
async def unassign_all_hosts(rack_id: str, session: CurrentSession) -> None:
    """Remove all host placements from a rack."""
    rack_manager.unassign_all_hosts(session, rack_id)


@router.patch("/{rack_id}", response_model=RackResponse)
async def update_rack(
    rack_id: str, body: RackUpdate, session: CurrentSession
) -> RackResponse:
    """Update a rack's properties."""
    rack = rack_manager.update_rack(session, rack_id, body)
    return RackResponse(rack=rack)


@router.delete("/{rack_id}", status_code=204)
async def delete_rack(rack_id: str, session: CurrentSession) -> None:
    """Delete a rack and remove host placements."""
    rack_manager.delete_rack(session, rack_id)
