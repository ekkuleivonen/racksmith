"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from racks.managers import rack_manager
from racks.schemas import RackCreate, RackItemInput, RackItemPreviewRequest, RackUpdate

router = APIRouter()


@router.get("")
async def list_racks(session=Depends(auth_manager.get_current_session)):
    return {"racks": rack_manager.list_racks(session)}


@router.post("", status_code=201)
async def create_rack(body: RackCreate, session=Depends(auth_manager.get_current_session)):
    try:
        rack = await rack_manager.create_rack(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack, "rack_id": rack.id}


@router.post("/preview-item")
async def preview_item(
    body: RackItemPreviewRequest, session=Depends(auth_manager.get_current_session)
):
    try:
        item = await rack_manager.preview_item(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.get("/{rack_id}")
async def get_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack = rack_manager.get_rack(session, rack_id)
    except (FileNotFoundError, KeyError):
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"rack": rack, "items": rack.items}


@router.patch("/{rack_id}")
async def update_rack(
    rack_id: str, body: RackUpdate, session=Depends(auth_manager.get_current_session)
):
    try:
        rack = rack_manager.update_rack(session, rack_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack}


@router.delete("/{rack_id}", status_code=204)
async def delete_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack_manager.delete_rack(session, rack_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")


@router.post("/{rack_id}/items", status_code=201)
async def add_item(
    rack_id: str, body: RackItemInput, session=Depends(auth_manager.get_current_session)
):
    try:
        item = await rack_manager.add_item(session, rack_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.patch("/{rack_id}/items/{item_id}")
async def update_item(
    rack_id: str,
    item_id: str,
    body: RackItemInput,
    session=Depends(auth_manager.get_current_session),
):
    try:
        item = await rack_manager.update_item(session, rack_id, item_id, body)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.post("/{rack_id}/items/{item_id}/refresh")
async def refresh_item(
    rack_id: str,
    item_id: str,
    session=Depends(auth_manager.get_current_session),
):
    try:
        item = await rack_manager.rediscover_item(session, rack_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.delete("/{rack_id}/items/{item_id}", status_code=204)
async def remove_item(
    rack_id: str, item_id: str, session=Depends(auth_manager.get_current_session)
):
    try:
        rack_manager.remove_item(session, rack_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
