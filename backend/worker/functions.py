"""arq job functions for stack execution."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import yaml
import aiosqlite
import settings
from stacks.managers import (
    ACTIONS_DIR,
    INVENTORY_DIR,
    STACKS_DIR,
    RUN_EVENTS_CHANNEL_PREFIX,
    sync_builtin_actions,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def execute_run(
    ctx,
    *,
    run_id: str,
    repo_path: str,
    stack_id: str,
    hosts: list[str],
    runtime_vars: dict | None = None,
    become_password: str | None = None,
) -> None:
    """Execute ansible-playbook in worker process, publishing output via Redis pub/sub."""
    redis = ctx["redis"]
    channel = f"{RUN_EVENTS_CHANNEL_PREFIX}{run_id}:events"

    repo = Path(repo_path)
    stack_path = repo / STACKS_DIR / f"{stack_id}.yml"
    inventory_dir = repo / INVENTORY_DIR
    actions_dir = (repo / ACTIONS_DIR).resolve()

    sync_builtin_actions(repo)

    # Write a minimal ansible.cfg that sets roles_path to our actions dir.
    # This overrides any ansible.cfg in the repo (e.g. roles_path = .racksmith/actions).
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".cfg", delete=False, prefix="racksmith_ansible_"
    ) as f:
        f.write(f"[defaults]\nroles_path = {actions_dir}\n")
        ansible_config_path = f.name

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
        str(stack_path),
        "-i",
        str(inventory_dir),
        "--limit",
        ",".join(hosts),
    ]

    extra: dict[str, str] = dict(runtime_vars or {})
    if become_password:
        extra["ansible_become_pass"] = become_password

    tmp_vars_path: str | None = None
    if extra:
        tmp = Path(tempfile.mktemp(suffix=".yml"))
        tmp.write_text(yaml.safe_dump(extra))
        tmp_vars_path = str(tmp)
        command += ["--extra-vars", f"@{tmp_vars_path}"]
        command_line = f"$ {' '.join(command)} [runtime vars redacted]\n"
    else:
        command_line = f"$ {' '.join(command)}\n"

    await redis.publish(channel, json.dumps({"type": "output", "data": command_line}))
    output = command_line

    try:
        env = os.environ.copy()
        env["ANSIBLE_CONFIG"] = ansible_config_path
        env["ANSIBLE_ROLES_PATH"] = str(actions_dir)
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
    try:
        os.unlink(ansible_config_path)
    except OSError:
        pass
    if tmp_vars_path:
        try:
            os.unlink(tmp_vars_path)
        except OSError:
            pass
