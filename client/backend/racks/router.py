"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter

from auth.dependencies import CurrentSession
from racks.managers import rack_manager
from racks.schemas import (
    RackCreate,
    RackCreateResponse,
    RackLayoutResponse,
    RackListResponse,
    RackResponse,
    RackUpdate,
)

router = APIRouter()


@router.get("", response_model=RackListResponse)
async def list_racks(session: CurrentSession) -> RackListResponse:
    """List all server racks in the active repo."""
    return RackListResponse(racks=rack_manager.list_racks(session))


@router.post("", status_code=201, response_model=RackCreateResponse)
async def create_rack(body: RackCreate, session: CurrentSession) -> RackCreateResponse:
    """Create a new server rack."""
    rack = rack_manager.create_rack(session, body)
    return RackCreateResponse(rack=rack, rack_id=rack.id)


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
