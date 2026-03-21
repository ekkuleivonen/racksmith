"""SSH terminal — WebSocket to SSH process bridge."""

from __future__ import annotations

import asyncio
from typing import Any

import asyncssh
from racksmith_shared.logging import get_logger

from ssh.misc import _connect_kwargs

logger = get_logger(__name__)


async def proxy_terminal(
    ip: str,
    ssh_user: str,
    ssh_port: int,
    websocket: Any,
    on_command: Any = None,
) -> None:
    """Open SSH connection and bidirectionally pipe to WebSocket."""
    logger.info("ssh_terminal_opened", ip=ip)
    try:
        conn = await asyncssh.connect(**_connect_kwargs(ip, ssh_user, ssh_port))
    except (OSError, asyncssh.Error) as exc:
        logger.warning("ssh_connect_failed", ip=ip, error=str(exc))
        await websocket.send_json({"type": "error", "message": f"Connection failed: {exc}"})
        await websocket.close(code=4502)
        return

    process = await conn.create_process(term_type="xterm")

    async def pump_stream(stream) -> None:
        while True:
            chunk = await stream.read(4096)
            if not chunk:
                break
            await websocket.send_json({"type": "output", "data": chunk})

    async def pump_input() -> None:
        while True:
            message = await websocket.receive_json()
            event_type = str(message.get("type") or "")
            if event_type == "input":
                data = str(message.get("data") or "")
                process.stdin.write(data)
                if data.endswith("\n") and on_command:
                    asyncio.create_task(on_command(data.rstrip("\r\n")))
            elif event_type == "resize":
                cols = int(message.get("cols") or 120)
                rows = int(message.get("rows") or 30)
                process.change_terminal_size(cols, rows)
            elif event_type == "close":
                break

    tasks = [
        asyncio.create_task(pump_stream(process.stdout)),
        asyncio.create_task(pump_stream(process.stderr)),
        asyncio.create_task(pump_input()),
    ]
    try:
        await websocket.send_json({
            "type": "connected",
            "ip_address": ip,
            "ssh_user": ssh_user,
            "ssh_port": ssh_port,
        })
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            task.result()
    finally:
        process.close()
        conn.close()
        await conn.wait_closed()
        logger.info("ssh_terminal_closed", ip=ip)
