"""Daemon SSH HTTP/WS routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, WebSocket

from auth import verify_daemon_token
from ssh.history import load_history, record_command
from ssh.keys import generate_ssh_key_pair, machine_public_key
from ssh.ping import ping_hosts
from ssh.probe import probe_ssh_target
from ssh.reboot import reboot_node
from ssh.schemas import (
    PingEntry,
    PingRequest,
    PingResponse,
    PublicKeyResponse,
    RebootRequest,
    RecordCommandRequest,
    SSHProbeRequest,
    SSHProbeResponse,
)
from ssh.terminal import proxy_terminal

router = APIRouter()


@router.post("/probe", response_model=SSHProbeResponse, dependencies=[Depends(verify_daemon_token)])
async def probe(body: SSHProbeRequest) -> SSHProbeResponse:
    try:
        result = await probe_ssh_target(body.ip, body.ssh_user, body.ssh_port)
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from exc
    return SSHProbeResponse(
        ip_address=result.ip_address,
        name=result.name,
        mac_address=result.mac_address,
        os=result.os,
        labels=result.labels,
    )


@router.post("/reboot", status_code=202, dependencies=[Depends(verify_daemon_token)])
async def reboot(body: RebootRequest):
    try:
        await reboot_node(body.ip, body.ssh_user, body.ssh_port)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"status": "rebooting"}


@router.post("/ping", response_model=PingResponse, dependencies=[Depends(verify_daemon_token)])
async def ping(body: PingRequest) -> PingResponse:
    results = await ping_hosts(body.ips)
    return PingResponse(
        results=[
            PingEntry(ip=ip, status="online" if reachable else "offline")
            for ip, reachable in results.items()
        ]
    )


@router.get("/public-key", response_model=PublicKeyResponse, dependencies=[Depends(verify_daemon_token)])
async def get_public_key() -> PublicKeyResponse:
    return PublicKeyResponse(public_key=machine_public_key())


@router.post("/generate-key", response_model=PublicKeyResponse, dependencies=[Depends(verify_daemon_token)])
async def generate_key() -> PublicKeyResponse:
    return PublicKeyResponse(public_key=generate_ssh_key_pair())


@router.get("/history/{user_id}/{host_id}", dependencies=[Depends(verify_daemon_token)])
async def get_history(user_id: str, host_id: str):
    history = await load_history(user_id, host_id)
    return {"history": [e.model_dump() for e in reversed(history)]}


@router.post("/record-command", dependencies=[Depends(verify_daemon_token)])
async def api_record_command(body: RecordCommandRequest):
    await record_command(body.user_id, body.host_id, body.host_name, body.ip_address, body.command)
    return {"status": "ok"}


@router.websocket("/connect")
async def terminal_socket(websocket: WebSocket):
    """WebSocket terminal. First message must be JSON with {ip, ssh_user, ssh_port, [token]}."""
    await websocket.accept()
    init = await websocket.receive_json()

    if settings_daemon_secret := __import__("settings").DAEMON_SECRET:
        if init.get("token") != settings_daemon_secret:
            await websocket.send_json({"type": "error", "message": "Unauthorized"})
            await websocket.close(code=4401)
            return

    ip = init.get("ip", "")
    ssh_user = init.get("ssh_user", "")
    ssh_port = int(init.get("ssh_port", 22))

    if not ip or not ssh_user:
        await websocket.send_json({"type": "error", "message": "Missing ip or ssh_user"})
        await websocket.close(code=4400)
        return

    await proxy_terminal(ip, ssh_user, ssh_port, websocket)
