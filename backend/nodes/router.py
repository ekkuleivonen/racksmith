"""Node REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from github.managers import auth_manager
from nodes.managers import node_manager
from nodes.schemas import NodeInput

router = APIRouter()


@router.get("")
async def list_nodes(session=Depends(auth_manager.get_current_session)):
    nodes = node_manager.list_nodes(session)
    return {"nodes": [n.model_dump() for n in nodes]}


@router.post("", status_code=201)
async def create_node(body: NodeInput, session=Depends(auth_manager.get_current_session)):
    try:
        node = node_manager.create_node(session, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"node": node.model_dump(), "slug": node.slug}


@router.get("/{slug}")
async def get_node(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        node = node_manager.get_node(session, slug)
    except KeyError:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"node": node.model_dump()}


@router.patch("/{slug}")
async def update_node(
    slug: str, body: NodeInput, session=Depends(auth_manager.get_current_session)
):
    try:
        node = node_manager.update_node(session, slug, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"node": node.model_dump()}


@router.delete("/{slug}", status_code=204)
async def delete_node(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        node_manager.delete_node(session, slug)
    except KeyError:
        raise HTTPException(status_code=404, detail="Node not found")


@router.post("/{slug}/refresh")
async def refresh_node(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        node = await node_manager.probe_node(session, slug)
    except KeyError:
        raise HTTPException(status_code=404, detail="Node not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"node": node.model_dump()}


@router.post("/preview")
async def preview_node(body: NodeInput, session=Depends(auth_manager.get_current_session)):
    try:
        node = await node_manager.preview_node(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"node": node.model_dump()}
