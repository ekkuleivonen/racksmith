"""Rack REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from racks.managers import rack_manager
from racks.schemas import RackCreate, RackItemInput, RackUpdate

router = APIRouter()


def _owner(session) -> str:
    login = str(session.user.get("login") or "")
    if not login:
        raise HTTPException(status_code=401, detail="Invalid session user")
    return login


@router.get("")
async def list_racks(session=Depends(auth_manager.get_current_session)):
    return {"racks": rack_manager.list_racks(_owner(session))}


@router.post("", status_code=201)
async def create_rack(body: RackCreate, session=Depends(auth_manager.get_current_session)):
    try:
        rack = rack_manager.create_rack(_owner(session), body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack}


@router.get("/{rack_id}")
async def get_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack = rack_manager.get_rack(_owner(session), rack_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    return {"rack": rack}


@router.patch("/{rack_id}")
async def update_rack(
    rack_id: str, body: RackUpdate, session=Depends(auth_manager.get_current_session)
):
    try:
        rack = rack_manager.update_rack(_owner(session), rack_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"rack": rack}


@router.delete("/{rack_id}", status_code=204)
async def delete_rack(rack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        rack_manager.delete_rack(_owner(session), rack_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")


@router.post("/{rack_id}/items", status_code=201)
async def add_item(
    rack_id: str, body: RackItemInput, session=Depends(auth_manager.get_current_session)
):
    try:
        item = rack_manager.add_item(_owner(session), rack_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.put("/{rack_id}/items/{item_id}")
async def update_item(
    rack_id: str,
    item_id: str,
    body: RackItemInput,
    session=Depends(auth_manager.get_current_session),
):
    try:
        item = rack_manager.update_item(_owner(session), rack_id, item_id, body)
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
        rack_manager.remove_item(_owner(session), rack_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{rack_id}/sync")
async def sync_to_remote(rack_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        result = await rack_manager.sync_to_remote(
            _owner(session), rack_id, session.access_token
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Rack not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result
