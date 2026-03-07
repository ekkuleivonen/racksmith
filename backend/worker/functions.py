"""arq job functions for playbook execution."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import aiosqlite
import settings
from playbooks.managers import (
    INVENTORY_DIR,
    PLAYBOOKS_DIR,
    ROLES_DIR,
    RUN_EVENTS_CHANNEL_PREFIX,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def execute_run(
    ctx,
    *,
    run_id: str,
    repo_path: str,
    playbook_id: str,
    hosts: list[str],
) -> None:
    """Execute ansible-playbook in worker process, publishing output via Redis pub/sub."""
    redis = ctx["redis"]
    channel = f"{RUN_EVENTS_CHANNEL_PREFIX}{run_id}:events"

    repo = Path(repo_path)
    playbook_path = repo / PLAYBOOKS_DIR / f"{playbook_id}.yml"
    inventory_dir = repo / INVENTORY_DIR
    roles_dir = repo / ROLES_DIR

    async with aiosqlite.connect(settings.DB_PATH) as db:
        # Update status to running
        await db.execute(
            "UPDATE runs SET status = ?, started_at = ? WHERE id = ?",
            ("running", _now_iso(), run_id),
        )
        await db.commit()

    await redis.publish(channel, json.dumps({"type": "status", "status": "running"}))

    command = [
        "ansible-playbook",
        str(playbook_path),
        "-i",
        str(inventory_dir),
        "--limit",
        ",".join(hosts),
    ]
    command_line = f"$ {' '.join(command)}\n"
    await redis.publish(channel, json.dumps({"type": "output", "data": command_line}))

    output = command_line

    try:
        env = os.environ.copy()
        env["ANSIBLE_ROLES_PATH"] = os.pathsep.join(
            [str(roles_dir), env.get("ANSIBLE_ROLES_PATH", "")],
        ).strip(os.pathsep)
        if settings.SSH_DISABLE_HOST_KEY_CHECK:
            env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["ANSIBLE_FORCE_COLOR"] = "True"
        env["PY_COLORS"] = "1"
        env["TERM"] = env.get("TERM") or "xterm-256color"

        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
    except FileNotFoundError:
        error_msg = "ansible-playbook was not found on PATH.\n"
        output += error_msg
        await redis.publish(channel, json.dumps({"type": "output", "data": error_msg}))
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute(
                """UPDATE runs SET status = ?, started_at = ?, finished_at = ?, exit_code = ?, output = ?
                   WHERE id = ?""",
                ("failed", _now_iso(), _now_iso(), 127, output, run_id),
            )
            await db.commit()
        await redis.publish(channel, json.dumps({"type": "status", "status": "failed"}))
        await redis.publish(channel, json.dumps({"type": "done"}))
        return

    assert process.stdout is not None
    while True:
        chunk = await process.stdout.read(4096)
        if not chunk:
            break
        text = chunk.decode("utf-8", errors="replace")
        output += text
        await redis.publish(channel, json.dumps({"type": "output", "data": text}))

    exit_code = await process.wait()
    status = "completed" if exit_code == 0 else "failed"
    finished_at = _now_iso()

    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            """UPDATE runs SET status = ?, finished_at = ?, exit_code = ?, output = ? WHERE id = ?""",
            (status, finished_at, exit_code, output, run_id),
        )
        await db.commit()

    await redis.publish(channel, json.dumps({"type": "status", "status": status}))
    await redis.publish(channel, json.dumps({"type": "done"}))
