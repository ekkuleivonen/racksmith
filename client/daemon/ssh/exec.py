"""Run a single command over SSH (non-interactive)."""

from __future__ import annotations

import asyncio
import re
from contextlib import suppress

import asyncssh

from ssh.misc import _connect_kwargs

_MAX_STDOUT = 8192
_MAX_STDERR = 4096

# Block obviously destructive / disruptive patterns (case-insensitive).
_DANGEROUS_PATTERNS = (
    r"\brm\s+-rf\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\breboot\b",
    r"\bshutdown\b",
    r"\bhalt\b",
    r"\bpoweroff\b",
    r"\binit\s+0\b",
    r"\binit\s+6\b",
    r":\(\)\s*\{",
    r">\s*/dev/sd",
    r"\bwipefs\b",
)


def is_dangerous_ssh_command(command: str) -> str | None:
    """Return a reason string if *command* is blocked, else None."""
    text = command.strip()
    if not text:
        return "Empty command"
    lowered = text.lower()
    for pat in _DANGEROUS_PATTERNS:
        if re.search(pat, lowered, re.IGNORECASE):
            return f"Command matches blocked pattern: {pat!r}"
    return None


async def ssh_exec_command(
    ip: str,
    ssh_user: str,
    ssh_port: int,
    command: str,
    *,
    timeout: float = 30.0,
) -> tuple[int | None, str, str]:
    """Run *command* on the remote host. Returns (exit_code, stdout, stderr)."""
    reason = is_dangerous_ssh_command(command)
    if reason:
        raise ValueError(reason)

    conn = await asyncssh.connect(**_connect_kwargs(ip, ssh_user, ssh_port))
    try:
        result = await asyncio.wait_for(conn.run(command), timeout=timeout)
        exit_code = result.exit_status
        stdout = (result.stdout or "")[:_MAX_STDOUT]
        stderr = (result.stderr or "")[:_MAX_STDERR]
        return exit_code, stdout, stderr
    finally:
        conn.close()
        with suppress(Exception):
            await conn.wait_closed()
