"""Host REST API router, SSH routes, and network scan routes."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, WebSocket

import settings
from _utils.websocket import require_ws_session, ws_error_handler
from auth.dependencies import CurrentSession
from hosts.managers import host_manager
from hosts.scan import scan_manager
from hosts.scan_schemas import ScanRequest, ScanResponse, ScanStatus
from hosts.schemas import (
    BulkAddLabelRequest,
    BulkAddLabelResponse,
    BulkAddToGroupRequest,
    BulkAddToGroupResponse,
    BulkHostCreateRequest,
    BulkHostCreateResponse,
    HostCreate,
    HostListResponse,
    HostResponse,
    HostUpdate,
)
from hosts.ssh import ssh_manager
from hosts.ssh_schemas import (
    HistoryResponse,
    PingStatusesResponse,
    PingStatusRequest,
    PublicKeyResponse,
    RebootResponse,
)

hosts_router = APIRouter()


@hosts_router.get("", response_model=HostListResponse)
async def list_hosts(session: CurrentSession) -> HostListResponse:
    """List all hosts in the active repo inventory."""
    hosts = host_manager.list_hosts(session)
    return HostListResponse(hosts=hosts)


@hosts_router.post("", status_code=201, response_model=HostResponse)
async def create_host(body: HostCreate, session: CurrentSession) -> HostResponse:
    """Create a new host in the inventory."""
    host = await host_manager.create_host(session, body)
    return HostResponse(host=host)


@hosts_router.get("/{host_id}", response_model=HostResponse)
async def get_host(host_id: str, session: CurrentSession) -> HostResponse:
    """Get a single host by ID."""
    host = host_manager.get_host(session, host_id)
    return HostResponse(host=host)


@hosts_router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    host_id: str, body: HostUpdate, session: CurrentSession
) -> HostResponse:
    """Update a host's properties."""
    host = host_manager.update_host(session, host_id, body)
    return HostResponse(host=host)


@hosts_router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: str, session: CurrentSession) -> None:
    """Delete a host from the inventory."""
    host_manager.delete_host(session, host_id)


@hosts_router.post("/{host_id}/refresh", response_model=HostResponse)
async def refresh_host(host_id: str, session: CurrentSession) -> HostResponse:
    """Probe host via SSH to refresh OS/facts."""
    host = await host_manager.probe_host(session, host_id)
    return HostResponse(host=host)


@hosts_router.post("/bulk/add-to-group", response_model=BulkAddToGroupResponse)
async def bulk_add_to_group(
    body: BulkAddToGroupRequest,
    session: CurrentSession,
) -> BulkAddToGroupResponse:
    """Add multiple hosts to a group."""
    updated = host_manager.bulk_add_to_group(session, body.host_ids, body.group_id)
    return BulkAddToGroupResponse(updated=updated)


@hosts_router.post("/bulk/add-label", response_model=BulkAddLabelResponse)
async def bulk_add_label(
    body: BulkAddLabelRequest,
    session: CurrentSession,
) -> BulkAddLabelResponse:
    """Add a label to multiple hosts."""
    updated = host_manager.bulk_add_label(session, body.host_ids, body.label)
    return BulkAddLabelResponse(updated=updated)


@hosts_router.post("/bulk/create", status_code=201, response_model=BulkHostCreateResponse)
async def bulk_create_hosts(
    body: BulkHostCreateRequest,
    session: CurrentSession,
) -> BulkHostCreateResponse:
    """Create multiple managed hosts at once."""
    hosts = []
    for entry in body.hosts:
        entry.managed = True
        host = await host_manager.create_host(session, entry)
        hosts.append(host)
    return BulkHostCreateResponse(hosts=hosts)


@hosts_router.post("/preview", response_model=HostResponse)
async def preview_host(body: HostCreate, session: CurrentSession) -> HostResponse:
    """Probe a host via SSH without saving to return a preview."""
    host = await host_manager.preview_host(body)
    return HostResponse(host=host)


# ---------------------------------------------------------------------------
# Network scan routes (mounted at /api/discovery)
# ---------------------------------------------------------------------------

scan_router = APIRouter()


@scan_router.post("", status_code=201, response_model=ScanResponse)
async def start_scan(
    body: ScanRequest,
    session: CurrentSession,
) -> ScanResponse:
    """Start a network discovery scan on the given (or auto-detected) subnet."""
    scan_id = await scan_manager.start_scan(session, body.subnet)
    return ScanResponse(scan_id=scan_id)


@scan_router.get("/{scan_id}", response_model=ScanStatus)
async def get_scan(
    scan_id: str,
    session: CurrentSession,
) -> ScanStatus:
    """Poll the status and results of a network scan."""
    return await scan_manager.get_scan(scan_id)


# ---------------------------------------------------------------------------
# SSH routes (mounted at /api/ssh)
# ---------------------------------------------------------------------------

ssh_router = APIRouter()


@ssh_router.get("/hosts/{host_id}/history", response_model=HistoryResponse)
async def list_history(
    host_id: str,
    session: CurrentSession,
) -> HistoryResponse:
    """List SSH command history for a host."""
    history = await ssh_manager.list_history(session, host_id)
    return HistoryResponse(history=history)


@ssh_router.post("/hosts/{host_id}/reboot", status_code=202, response_model=RebootResponse)
async def reboot_node(
    host_id: str,
    session: CurrentSession,
) -> RebootResponse:
    """Reboot a remote host via SSH."""
    try:
        await ssh_manager.reboot_node(session, host_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RebootResponse(status="rebooting")


@ssh_router.post("/ping-status", response_model=PingStatusesResponse)
async def ping_statuses(
    body: PingStatusRequest,
    session: CurrentSession,
) -> PingStatusesResponse:
    """Ping multiple hosts and return their reachability status."""
    statuses = await ssh_manager.ping_statuses(session, body.targets)
    return PingStatusesResponse(statuses=statuses)


@ssh_router.post("/generate-key", response_model=PublicKeyResponse)
async def generate_key(
    session: CurrentSession,
) -> PublicKeyResponse:
    """Generate a new SSH key pair and return the public key."""
    public_key = ssh_manager.generate_key(session)
    return PublicKeyResponse(public_key=public_key)


@ssh_router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key(
    session: CurrentSession,
) -> PublicKeyResponse:
    """Get the current SSH public key."""
    public_key = ssh_manager.public_key(session)
    return PublicKeyResponse(public_key=public_key)


@ssh_router.websocket("/hosts/{host_id}/terminal")
async def terminal_socket(
    websocket: WebSocket,
    host_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> None:
    """Open an interactive SSH terminal session over WebSocket."""
    session = await require_ws_session(websocket, session_id)
    if not session:
        return
    await websocket.accept()
    async with ws_error_handler(websocket):
        await ssh_manager.proxy_terminal(session, host_id, websocket)
