"""SSH reboot command."""

from __future__ import annotations

import asyncio
from contextlib import suppress

import asyncssh
from racksmith_shared.logging import get_logger

from ssh.misc import _connect_kwargs

logger = get_logger(__name__)


async def reboot_node(ip: str, ssh_user: str, ssh_port: int) -> None:
    conn = await asyncssh.connect(**_connect_kwargs(ip, ssh_user, ssh_port))
    try:
        process = await conn.create_process("sudo reboot", term_type="xterm")
        try:
            await asyncio.wait_for(process.wait_closed(), timeout=2)
            if process.exit_status not in (0, None):
                stderr = (await process.stderr.read()).strip()
                raise RuntimeError(stderr or "Failed to reboot device")
        except TimeoutError:
            return
        except (asyncssh.ConnectionLost, BrokenPipeError, OSError):
            return
    finally:
        conn.close()
        with suppress(Exception):
            await conn.wait_closed()
    logger.info("reboot_sent", ip=ip)
