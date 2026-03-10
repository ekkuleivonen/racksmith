"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from racks.managers import rack_manager
from racks.schemas import RackCreate, RackUpdate

router = APIRouter()


@router.get("")
async def list_racks(session=Depends(auth_manager.get_current_session)):
    """List all server racks in the active repo."""
    return {"racks": rack_manager.list_racks(session)}


@router.post("", status_code=201)
async def create_rack(body: RackCreate, session=Depends(auth_manager.get_current_session)):
    """Create a new server rack."""
    try:
        rack = rack_manager.create_rack(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack, "rack_id": rack.id}


@router.get("/{rack_id}")
async def get_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    """Get a single rack by ID."""
    try:
        rack = rack_manager.get_rack(session, rack_id)
    except (FileNotFoundError, KeyError):
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"rack": rack}


@router.get("/{rack_id}/layout")
async def get_rack_layout(rack_id: str, session=Depends(auth_manager.get_current_session)):
    """Get the visual layout grid for a rack."""
    try:
        layout = rack_manager.get_layout(session, rack_id)
    except (FileNotFoundError, KeyError):
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"layout": layout}


@router.patch("/{rack_id}")
async def update_rack(
    rack_id: str, body: RackUpdate, session=Depends(auth_manager.get_current_session)
):
    """Update a rack's properties."""
    try:
        rack = rack_manager.update_rack(session, rack_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack}


@router.delete("/{rack_id}", status_code=204)
async def delete_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    """Delete a rack and remove host placements."""
    try:
        rack_manager.delete_rack(session, rack_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
