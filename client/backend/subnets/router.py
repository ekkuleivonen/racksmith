"""Subnet REST API router."""

from __future__ import annotations

from ipaddress import IPv4Network

from fastapi import APIRouter

from auth.dependencies import CurrentSession
from core import resolve_layout
from core.racksmith_meta import read_meta, set_subnet_meta, write_meta
from repo.managers import repos_manager
from subnets.schemas import SubnetListResponse, SubnetMeta, SubnetResponse, SubnetUpdate

router = APIRouter()


@router.get("", response_model=SubnetListResponse)
async def list_subnets(
    session: CurrentSession,
) -> SubnetListResponse:
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    subnets = [
        SubnetMeta(cidr=cidr, **data)
        for cidr, data in meta.subnets.items()
    ]
    return SubnetListResponse(subnets=subnets)


@router.put("/{cidr:path}", response_model=SubnetResponse)
async def upsert_subnet(
    cidr: str,
    body: SubnetUpdate,
    session: CurrentSession,
) -> SubnetResponse:
    try:
        IPv4Network(cidr, strict=False)
    except ValueError:
        raise ValueError(f"Invalid CIDR: {cidr}")
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    data = {"name": body.name, "description": body.description}
    if not body.name and not body.description:
        meta.subnets.pop(cidr, None)
    else:
        set_subnet_meta(meta, cidr, data)
    write_meta(layout, meta)
    return SubnetResponse(subnet=SubnetMeta(cidr=cidr, **data))
