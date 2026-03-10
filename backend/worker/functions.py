"""arq job functions for playbook and role execution."""

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
from _utils.logging import get_logger
from ansible import resolve_layout

logger = get_logger(__name__)
from ssh.misc import _racksmith_ssh_dir

def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _ansible_env(ansible_config_path: str, roles_path: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["ANSIBLE_CONFIG"] = ansible_config_path
    env["ANSIBLE_ROLES_PATH"] = str(roles_path)
    if settings.SSH_DISABLE_HOST_KEY_CHECK:
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
    env["ANSIBLE_FORCE_COLOR"] = "True"
    env["PY_COLORS"] = "1"
    env["TERM"] = env.get("TERM") or "xterm-256color"
    priv_key = _racksmith_ssh_dir() / "id_ed25519"
    if priv_key.is_file():
        env["ANSIBLE_PRIVATE_KEY_FILE"] = str(priv_key)
    return env


async def execute_playbook_run(
    ctx,
    *,
    run_id: str,
    repo_path: str,
    playbook_id: str,
    hosts: list[str],
    runtime_vars: dict | None = None,
    become: bool = False,
    become_password: str | None = None,
) -> None:
    """Execute ansible-playbook in worker process, publishing output via Redis pub/sub."""
    logger.info("playbook_run_started", run_id=run_id, playbook_id=playbook_id, hosts=hosts)
    redis = ctx["redis"]
    channel = f"{settings.REDIS_RUN_EVENTS_PREFIX}{run_id}:events"

    repo = Path(repo_path)
    layout = resolve_layout(repo)
    playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
    if not playbook_path.exists():
        playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
    inventory_path = layout.inventory_path
    roles_path = layout.roles_path.resolve()

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".cfg", delete=False, prefix="racksmith_ansible_"
    ) as f:
        f.write(f"[defaults]\nroles_path = {roles_path}\n")
        ansible_config_path = f.name

    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            "UPDATE playbook_runs SET status = ?, started_at = ? WHERE id = ?",
            ("running", _now_iso(), run_id),
        )
        await db.commit()

    await redis.publish(channel, json.dumps({"type": "status", "status": "running"}))

    command = [
        "ansible-playbook",
        str(playbook_path),
        "-i",
        str(inventory_path),
        "--limit",
        ",".join(hosts),
    ]
    if become:
        command.append("--become")

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
        env = _ansible_env(ansible_config_path, roles_path)
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
    except FileNotFoundError:
        error_msg = "ansible-playbook was not found on PATH.\n"
        logger.error("playbook_run_failed", run_id=run_id, error=error_msg.strip())
        output += error_msg
        await redis.publish(channel, json.dumps({"type": "output", "data": error_msg}))
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute(
                """UPDATE playbook_runs SET status = ?, started_at = ?, finished_at = ?, exit_code = ?, output = ?
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
            """UPDATE playbook_runs SET status = ?, finished_at = ?, exit_code = ?, output = ? WHERE id = ?""",
            (status, finished_at, exit_code, output, run_id),
        )
        await db.commit()

    logger.info(
        "playbook_run_finished",
        run_id=run_id,
        exit_code=exit_code,
        status=status,
    )
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


async def execute_role_run(
    ctx,
    *,
    run_id: str,
    repo_path: str,
    role_slug: str,
    hosts: list[str],
    role_vars: dict | None = None,
    become: bool = False,
    runtime_vars: dict | None = None,
    become_password: str | None = None,
) -> None:
    """Execute a single role as an ansible-playbook run."""
    logger.info("role_run_started", run_id=run_id, role_slug=role_slug, hosts=hosts)
    redis = ctx["redis"]
    channel = f"{settings.REDIS_RUN_EVENTS_PREFIX}{run_id}:events"

    repo = Path(repo_path)
    layout = resolve_layout(repo)
    inventory_path = layout.inventory_path
    roles_path = layout.roles_path.resolve()

    role_entry: dict | str = role_slug
    if role_vars:
        role_entry = {"role": role_slug, "vars": dict(role_vars)}

    playbook = [
        {
            "name": f"Run role: {role_slug}",
            "hosts": "all",
            "gather_facts": True,
            "become": become,
            "roles": [role_entry],
        }
    ]

    tmp_playbook = tempfile.NamedTemporaryFile(
        mode="w", suffix=".yml", delete=False, prefix="racksmith_role_"
    )
    tmp_playbook.write(yaml.safe_dump(playbook, sort_keys=False))
    tmp_playbook.close()
    playbook_path = tmp_playbook.name

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".cfg", delete=False, prefix="racksmith_ansible_"
    ) as f:
        f.write(f"[defaults]\nroles_path = {roles_path}\n")
        ansible_config_path = f.name

    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            "UPDATE role_runs SET status = ?, started_at = ? WHERE id = ?",
            ("running", _now_iso(), run_id),
        )
        await db.commit()

    await redis.publish(channel, json.dumps({"type": "status", "status": "running"}))

    command = [
        "ansible-playbook",
        playbook_path,
        "-i",
        str(inventory_path),
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
        command_line = f"$ ansible-playbook [role: {role_slug}] [runtime vars redacted]\n"
    else:
        command_line = f"$ ansible-playbook [role: {role_slug}]\n"

    await redis.publish(channel, json.dumps({"type": "output", "data": command_line}))
    output = command_line

    try:
        env = _ansible_env(ansible_config_path, roles_path)
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
    except FileNotFoundError:
        error_msg = "ansible-playbook was not found on PATH.\n"
        logger.error("role_run_failed", run_id=run_id, error=error_msg.strip())
        output += error_msg
        await redis.publish(channel, json.dumps({"type": "output", "data": error_msg}))
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute(
                """UPDATE role_runs SET status = ?, started_at = ?, finished_at = ?, exit_code = ?, output = ?
                   WHERE id = ?""",
                ("failed", _now_iso(), _now_iso(), 127, output, run_id),
            )
            await db.commit()
        await redis.publish(channel, json.dumps({"type": "status", "status": "failed"}))
        await redis.publish(channel, json.dumps({"type": "done"}))
        _cleanup_temp_files(playbook_path, ansible_config_path, tmp_vars_path)
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

    logger.info(
        "role_run_finished",
        run_id=run_id,
        exit_code=exit_code,
        status=status,
    )
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            """UPDATE role_runs SET status = ?, finished_at = ?, exit_code = ?, output = ? WHERE id = ?""",
            (status, finished_at, exit_code, output, run_id),
        )
        await db.commit()

    await redis.publish(channel, json.dumps({"type": "status", "status": status}))
    await redis.publish(channel, json.dumps({"type": "done"}))
    _cleanup_temp_files(playbook_path, ansible_config_path, tmp_vars_path)


def _cleanup_temp_files(*paths: str | None) -> None:
    for p in paths:
        if p:
            try:
                os.unlink(p)
            except OSError:
                pass
