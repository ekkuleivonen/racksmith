"""Daemon proxy routes — thin proxies that resolve host data and forward to daemon."""

from __future__ import annotations

import asyncio

import httpx
from fastapi import APIRouter, Cookie, HTTPException, WebSocket

import settings
from _utils.exceptions import NotFoundError, RepoNotAvailableError
from _utils.websocket import require_ws_session, ws_error_handler
from auth.dependencies import CurrentSession
from auth.session import user_storage_id
from daemon.client import daemon_get, daemon_post
from hosts.managers import host_manager
from hosts.schemas import Host

router = APIRouter()


def _require_ssh_host(session, host_id: str) -> Host:
    host = host_manager.get_host(session, host_id)
    if not host.managed:
        raise ValueError("Host is not managed")
    if not host.ip_address or not host.ssh_user:
        raise ValueError("Host is missing IP address or ssh_user")
    return host


@router.websocket("/ssh/hosts/{host_id}/terminal")
async def proxy_terminal(
    websocket: WebSocket,
    host_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> None:
    """Proxy WebSocket terminal to daemon."""
    session = await require_ws_session(websocket, session_id)
    if not session:
        return
    await websocket.accept()
    async with ws_error_handler(websocket):
        host = _require_ssh_host(session, host_id)
        daemon_ws_url = settings.DAEMON_URL.replace("http", "ws").rstrip("/") + "/ssh/connect"

        async with httpx.AsyncClient() as _:
            import websockets

            async with websockets.connect(daemon_ws_url) as daemon_ws:
                init_msg = {
                    "ip": host.ip_address,
                    "ssh_user": host.ssh_user,
                    "ssh_port": host.ssh_port,
                    "token": settings.DAEMON_SECRET,
                }
                await daemon_ws.send(__import__("json").dumps(init_msg))

                async def frontend_to_daemon():
                    while True:
                        data = await websocket.receive_text()
                        await daemon_ws.send(data)

                async def daemon_to_frontend():
                    async for message in daemon_ws:
                        await websocket.send_text(message)

                tasks = [
                    asyncio.create_task(frontend_to_daemon()),
                    asyncio.create_task(daemon_to_frontend()),
                ]
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for t in pending:
                    t.cancel()


@router.post("/ssh/hosts/{host_id}/reboot", status_code=202)
async def reboot_host(host_id: str, session: CurrentSession):
    host = _require_ssh_host(session, host_id)
    try:
        await daemon_post("/ssh/reboot", {
            "ip": host.ip_address,
            "ssh_user": host.ssh_user,
            "ssh_port": host.ssh_port,
        })
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Daemon error: {exc.response.text}") from exc
    return {"status": "rebooting"}


@router.post("/ssh/ping-status")
async def ping_statuses(body: dict, session: CurrentSession):
    """Resolve host IPs and forward to daemon for ping."""
    from hosts.ssh_schemas import PingStatusTarget

    targets = [PingStatusTarget(**t) for t in body.get("targets", [])]
    ip_to_host_ids: dict[str, list[str]] = {}
    results: list[dict] = []

    for target in targets:
        try:
            host = host_manager.get_host(session, target.host_id)
        except (NotFoundError, RepoNotAvailableError):
            results.append({"host_id": target.host_id, "status": "unknown"})
            continue

        if not host.managed or not (host.ip_address or "").strip():
            results.append({"host_id": target.host_id, "status": "unknown"})
            continue

        ip = host.ip_address.strip()
        ip_to_host_ids.setdefault(ip, []).append(target.host_id)

    if ip_to_host_ids:
        try:
            daemon_resp = await daemon_post("/ssh/ping", {"ips": list(ip_to_host_ids.keys())})
            ip_status = {r["ip"]: r["status"] for r in daemon_resp.get("results", [])}
            for ip, host_ids in ip_to_host_ids.items():
                status = ip_status.get(ip, "unknown")
                for hid in host_ids:
                    results.append({"host_id": hid, "status": status})
        except Exception:
            for host_ids in ip_to_host_ids.values():
                for hid in host_ids:
                    results.append({"host_id": hid, "status": "unknown"})

    return {"statuses": results}


@router.get("/ssh/public-key")
async def public_key(session: CurrentSession):
    try:
        resp = await daemon_get("/ssh/public-key")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Daemon error: {exc.response.text}") from exc
    return resp


@router.post("/ssh/generate-key")
async def generate_key(session: CurrentSession):
    try:
        resp = await daemon_post("/ssh/generate-key")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Daemon error: {exc.response.text}") from exc
    return resp


@router.get("/ssh/hosts/{host_id}/history")
async def ssh_history(host_id: str, session: CurrentSession):
    host_manager.get_host(session, host_id)
    user_id = user_storage_id(session.user)
    try:
        resp = await daemon_get(f"/ssh/history/{user_id}/{host_id}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Daemon error: {exc.response.text}") from exc
    return resp


@router.post("/discovery", status_code=201)
async def start_scan(body: dict, session: CurrentSession):
    """Start a network scan — resolve known hosts and enqueue to daemon."""
    from ipaddress import IPv4Network

    from _utils.helpers import new_id
    from _utils.redis import AsyncRedis
    from _utils.repo_helpers import get_layout
    from core.inventory import read_hosts

    subnet = body.get("subnet")
    if not subnet:
        try:
            resp = await daemon_get("/discovery/subnet")
            subnet = resp["subnet"]
        except Exception:
            subnet = "192.168.1.0/24"

    try:
        IPv4Network(subnet, strict=False)
    except ValueError:
        raise HTTPException(400, f"Invalid subnet: {subnet}")

    scan_id = f"scan_{new_id()}"
    data = {
        "scan_id": scan_id,
        "status": "pending",
        "subnet": subnet,
        "devices": "[]",
        "error": "",
    }
    await AsyncRedis.hset_mapping(f"racksmith:scan:{scan_id}", data)
    await AsyncRedis.expire(f"racksmith:scan:{scan_id}", 600)

    known_hosts: list[dict[str, str]] = []
    try:
        layout = get_layout(session)
        for h in read_hosts(layout):
            entry: dict[str, str] = {"host_id": h.id}
            if h.ansible_host:
                entry["ip"] = h.ansible_host
            mac = h.racksmith.get("mac_address", "")
            if mac:
                entry["mac"] = mac
            known_hosts.append(entry)
    except Exception:
        pass

    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    await pool.enqueue_job(
        "execute_network_scan",
        scan_id=scan_id,
        subnet=subnet,
        known_hosts=known_hosts,
    )
    await pool.close()

    return {"scan_id": scan_id}


@router.get("/discovery/{scan_id}")
async def get_scan(scan_id: str, session: CurrentSession):
    try:
        resp = await daemon_get(f"/discovery/{scan_id}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Daemon error: {exc.response.text}") from exc
    return resp
