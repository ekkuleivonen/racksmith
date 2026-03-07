"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from racks.managers import rack_manager
from racks.schemas import RackCreate, RackUpdate

router = APIRouter()


@router.get("")
async def list_racks(session=Depends(auth_manager.get_current_session)):
    return {"racks": rack_manager.list_racks(session)}


@router.post("", status_code=201)
async def create_rack(body: RackCreate, session=Depends(auth_manager.get_current_session)):
    try:
        rack = rack_manager.create_rack(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack, "rack_slug": rack.slug}


@router.get("/{slug}")
async def get_rack(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack = rack_manager.get_rack(session, slug)
    except (FileNotFoundError, KeyError):
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"rack": rack}


@router.get("/{slug}/layout")
async def get_rack_layout(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        layout = rack_manager.get_layout(session, slug)
    except (FileNotFoundError, KeyError):
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"layout": layout}


@router.patch("/{slug}")
async def update_rack(
    slug: str, body: RackUpdate, session=Depends(auth_manager.get_current_session)
):
    try:
        rack = rack_manager.update_rack(session, slug, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack}


@router.delete("/{slug}", status_code=204)
async def delete_rack(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack_manager.delete_rack(session, slug)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
