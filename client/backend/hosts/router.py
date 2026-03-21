"""Host REST API router."""

from __future__ import annotations

from fastapi import APIRouter, Query

from _utils.pagination import paginate
from _utils.schemas import PaginatedResponse
from auth.dependencies import CurrentSession
from hosts.managers import host_manager
from hosts.schemas import (
    BulkAddLabelRequest,
    BulkAddLabelResponse,
    BulkAddToGroupRequest,
    BulkAddToGroupResponse,
    BulkHostCreateRequest,
    BulkHostCreateResponse,
    BulkImportDiscoveredRequest,
    Host,
    HostCreate,
    HostResponse,
    HostUpdate,
    RelocateRequest,
    RelocateResponse,
)

hosts_router = APIRouter()


@hosts_router.get("", response_model=PaginatedResponse[Host])
async def list_hosts(
    session: CurrentSession,
    q: str | None = Query(None, description="Search name, hostname, IP, labels, os_family"),
    group: str | None = Query(None, description="Group id(s), comma-separated — host in any"),
    label: str | None = Query(None, description="Label(s), comma-separated — host has any"),
    managed: bool | None = Query(None),
    subnet: str | None = Query(
        None,
        description="IPv4 CIDR(s), comma-separated — host IP in network or host.subnet match",
    ),
    sort: str = Query(
        "name",
        description="Sort field: name, hostname, ip, ssh_user, labels, id, managed, os_family",
    ),
    order: str = Query("asc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[Host]:
    hosts = host_manager.list_hosts_filtered(
        session,
        q=q,
        group=group,
        label=label,
        managed=managed,
        subnet=subnet,
        sort=sort,
        order=order,
    )
    slice_rows, total = paginate(hosts, page=page, per_page=per_page)
    return PaginatedResponse(items=slice_rows, total=total, page=page, per_page=per_page)


@hosts_router.post("", status_code=201, response_model=HostResponse)
async def create_host(body: HostCreate, session: CurrentSession) -> HostResponse:
    host = await host_manager.create_host(session, body)
    return HostResponse(host=host)


@hosts_router.get("/{host_id}", response_model=HostResponse)
async def get_host(host_id: str, session: CurrentSession) -> HostResponse:
    host = host_manager.get_host(session, host_id)
    return HostResponse(host=host)


@hosts_router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    host_id: str, body: HostUpdate, session: CurrentSession
) -> HostResponse:
    host = host_manager.update_host(session, host_id, body)
    return HostResponse(host=host)


@hosts_router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: str, session: CurrentSession) -> None:
    host_manager.delete_host(session, host_id)


@hosts_router.post("/{host_id}/refresh", response_model=HostResponse)
async def refresh_host(host_id: str, session: CurrentSession) -> HostResponse:
    host = await host_manager.probe_host(session, host_id)
    return HostResponse(host=host)


@hosts_router.post("/{host_id}/relocate", response_model=RelocateResponse)
async def relocate_host(
    host_id: str, body: RelocateRequest, session: CurrentSession
) -> RelocateResponse:
    host, previous_ip, new_ip, changed = await host_manager.relocate_host(
        session, host_id, body.subnet
    )
    return RelocateResponse(
        host=host, previous_ip=previous_ip, new_ip=new_ip, changed=changed
    )


@hosts_router.post("/bulk/add-to-group", response_model=BulkAddToGroupResponse)
async def bulk_add_to_group(
    body: BulkAddToGroupRequest,
    session: CurrentSession,
) -> BulkAddToGroupResponse:
    updated = host_manager.bulk_add_to_group(session, body.host_ids, body.group_id)
    return BulkAddToGroupResponse(updated=updated)


@hosts_router.post("/bulk/add-label", response_model=BulkAddLabelResponse)
async def bulk_add_label(
    body: BulkAddLabelRequest,
    session: CurrentSession,
) -> BulkAddLabelResponse:
    updated = host_manager.bulk_add_label(session, body.host_ids, body.label)
    return BulkAddLabelResponse(updated=updated)


@hosts_router.post("/bulk/create", status_code=201, response_model=BulkHostCreateResponse)
async def bulk_create_hosts(
    body: BulkHostCreateRequest,
    session: CurrentSession,
) -> BulkHostCreateResponse:
    hosts = []
    for entry in body.hosts:
        entry.managed = True
        host = await host_manager.create_host(session, entry)
        hosts.append(host)
    return BulkHostCreateResponse(hosts=hosts)


@hosts_router.post("/bulk/import-discovered", status_code=201, response_model=BulkHostCreateResponse)
async def bulk_import_discovered(
    body: BulkImportDiscoveredRequest,
    session: CurrentSession,
) -> BulkHostCreateResponse:
    """Bulk-create hosts from discovered devices."""
    hosts = await host_manager.bulk_import_discovered(session, body)
    return BulkHostCreateResponse(hosts=hosts)


@hosts_router.post("/preview", response_model=HostResponse)
async def preview_host(body: HostCreate, session: CurrentSession) -> HostResponse:
    host = await host_manager.preview_host(session, body)
    return HostResponse(host=host)
