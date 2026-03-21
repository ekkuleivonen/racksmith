"""Subnet REST API router."""

from __future__ import annotations

from ipaddress import IPv4Network

from fastapi import APIRouter, Query

from _utils.exceptions import AlreadyExistsError
from _utils.pagination import paginate, sort_order_reverse
from _utils.schemas import PaginatedResponse
from auth.dependencies import CurrentSession
from core import resolve_layout
from core.racksmith_meta import read_meta, set_subnet_meta, write_meta
from repo.managers import repos_manager
from subnets.schemas import SubnetCreate, SubnetMeta, SubnetPatch, SubnetResponse

router = APIRouter()


def _validate_cidr(cidr: str) -> None:
    try:
        IPv4Network(cidr, strict=False)
    except ValueError as exc:
        raise ValueError(f"Invalid CIDR: {cidr}") from exc


@router.get("", response_model=PaginatedResponse[SubnetMeta])
async def list_subnets(
    session: CurrentSession,
    q: str | None = Query(None, description="Search CIDR, name, or description"),
    sort: str = Query("cidr", description="Sort field: cidr, name"),
    order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[SubnetMeta]:
    """List subnet metadata (paginated)."""
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    subnets = [SubnetMeta(cidr=cidr, **data) for cidr, data in meta.subnets.items()]
    qn = (q or "").strip().lower()
    if qn:
        subnets = [
            s
            for s in subnets
            if qn in s.cidr.lower() or qn in (s.name or "").lower() or qn in (s.description or "").lower()
        ]
    rev = sort_order_reverse(order)
    sk = (sort or "cidr").lower()

    def sort_key(s: SubnetMeta) -> tuple[int, str, str]:
        if sk == "name":
            return (0, (s.name or "").lower(), s.cidr)
        return (0, s.cidr.lower(), s.cidr)

    subnets.sort(key=sort_key, reverse=rev)
    slice_rows, total = paginate(subnets, page=page, per_page=per_page)
    return PaginatedResponse(items=slice_rows, total=total, page=page, per_page=per_page)


@router.post("", status_code=201, response_model=SubnetResponse)
async def create_subnet(body: SubnetCreate, session: CurrentSession) -> SubnetResponse:
    _validate_cidr(body.cidr)
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    cidr = str(IPv4Network(body.cidr, strict=False))
    if cidr in meta.subnets:
        raise AlreadyExistsError(f"Subnet {cidr} already exists")
    data = {"name": body.name or "", "description": body.description or ""}
    set_subnet_meta(meta, cidr, data)
    write_meta(layout, meta)
    return SubnetResponse(subnet=SubnetMeta(cidr=cidr, **data))


@router.patch("/{cidr:path}", response_model=SubnetResponse)
async def update_subnet(
    cidr: str,
    body: SubnetPatch,
    session: CurrentSession,
) -> SubnetResponse:
    _validate_cidr(cidr)
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    key = str(IPv4Network(cidr, strict=False))
    if key not in meta.subnets:
        raise FileNotFoundError(f"Subnet {key} not found")
    cur = dict(meta.subnets[key])
    if body.name is not None:
        cur["name"] = body.name
    if body.description is not None:
        cur["description"] = body.description
    set_subnet_meta(meta, key, cur)
    write_meta(layout, meta)
    return SubnetResponse(subnet=SubnetMeta(cidr=key, **cur))


@router.delete("/{cidr:path}", status_code=204)
async def delete_subnet(cidr: str, session: CurrentSession) -> None:
    _validate_cidr(cidr)
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    meta = read_meta(layout)
    key = str(IPv4Network(cidr, strict=False))
    if key not in meta.subnets:
        raise FileNotFoundError(f"Subnet {key} not found")
    meta.subnets.pop(key, None)
    write_meta(layout, meta)
