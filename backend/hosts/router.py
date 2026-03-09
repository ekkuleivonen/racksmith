"""Host REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from hosts.managers import host_manager
from hosts.schemas import HostInput

router = APIRouter()


@router.get("")
async def list_hosts(session=Depends(auth_manager.get_current_session)):
    hosts = host_manager.list_hosts(session)
    return {"hosts": [h.model_dump() for h in hosts]}


@router.post("", status_code=201)
async def create_host(body: HostInput, session=Depends(auth_manager.get_current_session)):
    try:
        host = await host_manager.create_host(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"host": host.model_dump()}


@router.get("/{host_id}")
async def get_host(host_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        host = host_manager.get_host(session, host_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"host": host.model_dump()}


@router.patch("/{host_id}")
async def update_host(
    host_id: str, body: HostInput, session=Depends(auth_manager.get_current_session)
):
    try:
        host = host_manager.update_host(session, host_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"host": host.model_dump()}


@router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        host_manager.delete_host(session, host_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Host not found")


@router.post("/{host_id}/refresh")
async def refresh_host(host_id: str, session=Depends(auth_manager.get_current_session)):
    try:
        host = await host_manager.probe_host(session, host_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Host not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"host": host.model_dump()}


@router.post("/preview")
async def preview_host(body: HostInput, session=Depends(auth_manager.get_current_session)):
    try:
        host = await host_manager.preview_host(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"host": host.model_dump()}
