"""Ansible playbook/role execution — materializes workspace from serialized payloads."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

import yaml
from racksmith_shared.helpers import now_iso
from racksmith_shared.logging import get_logger
from racksmith_shared.runs import RUN_TTL, run_events_channel, run_key

import settings
from ansible.binaries import resolve_ansible_cli
from ansible.collections import COLLECTIONS_DIR
from ssh.misc import _racksmith_ssh_dir

logger = get_logger(__name__)


async def _update_run(redis, run_id: str, fields: dict[str, str]) -> None:
    key = run_key(run_id)
    await redis.hset(key, mapping=fields)
    await redis.expire(key, RUN_TTL)


def _materialize_workspace(
    playbook_yaml: str,
    inventory_yaml: str,
    host_vars: dict[str, str],
    group_vars: dict[str, str],
    role_files: dict[str, dict[str, str]],
) -> Path:
    """Write all files to a temp dir and return its path."""
    tmpdir = Path(tempfile.mkdtemp(prefix="racksmith_run_"))

    (tmpdir / "ansible.cfg").write_text(
        "[defaults]\n"
        "interpreter_python = auto_silent\n",
        encoding="utf-8",
    )

    (tmpdir / "playbook.yml").write_text(playbook_yaml)

    inv_dir = tmpdir / "inventory"
    inv_dir.mkdir()
    (inv_dir / "hosts.yml").write_text(inventory_yaml)

    hv_dir = inv_dir / "host_vars"
    hv_dir.mkdir()
    for host_id, content in host_vars.items():
        (hv_dir / f"{host_id}.yml").write_text(content)

    gv_dir = inv_dir / "group_vars"
    gv_dir.mkdir()
    for group_id, content in group_vars.items():
        (gv_dir / f"{group_id}.yml").write_text(content)

    roles_dir = tmpdir / "roles"
    roles_dir.mkdir()
    for role_id, files in role_files.items():
        for rel_path, content in files.items():
            file_path = roles_dir / role_id / rel_path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content)

    return tmpdir


def _ansible_env(tmpdir: Path) -> dict[str, str]:
    env = os.environ.copy()
    roles_path = tmpdir / "roles"
    env["ANSIBLE_ROLES_PATH"] = str(roles_path)
    env["ANSIBLE_COLLECTIONS_PATH"] = str(COLLECTIONS_DIR)
    if settings.SSH_DISABLE_HOST_KEY_CHECK:
        env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
    env["ANSIBLE_FORCE_COLOR"] = "True"
    env["PY_COLORS"] = "1"
    env["TERM"] = env.get("TERM") or "xterm-256color"
    priv_key = _racksmith_ssh_dir() / "id_ed25519"
    if priv_key.is_file():
        env["ANSIBLE_PRIVATE_KEY_FILE"] = str(priv_key)
    return env


def _prepare_extra_vars(
    command: list[str],
    runtime_vars: dict | None,
    become_password: str | None,
    tmpdir: Path,
) -> str | None:
    extra: dict[str, str] = dict(runtime_vars or {})
    if become_password:
        extra["ansible_become_pass"] = become_password
    if not extra:
        return None
    vars_path = tmpdir / "_extra_vars.yml"
    vars_path.write_text(yaml.safe_dump(extra))
    os.chmod(str(vars_path), 0o600)
    command += ["--extra-vars", f"@{vars_path}"]
    return str(vars_path)


async def _run_ansible(
    *,
    redis,
    run_id: str,
    log_event: str,
    tmpdir: Path,
    command: list[str],
    command_line: str,
) -> None:
    """Spawn ansible-playbook, stream output via Redis pub/sub, update run status."""
    channel = run_events_channel(run_id)

    await _update_run(redis, run_id, {"status": "running", "started_at": now_iso()})
    await redis.publish(channel, json.dumps({"type": "status", "status": "running"}))
    await redis.publish(channel, json.dumps({"type": "output", "data": command_line}))
    output = command_line

    try:
        env = _ansible_env(tmpdir)
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(tmpdir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
    except FileNotFoundError:
        error_msg = "ansible-playbook was not found on PATH.\n"
        logger.error(f"{log_event}_failed", run_id=run_id, error=error_msg.strip())
        output += error_msg
        await redis.publish(channel, json.dumps({"type": "output", "data": error_msg}))
        now = now_iso()
        await _update_run(redis, run_id, {
            "status": "failed", "started_at": now, "finished_at": now,
            "exit_code": "127", "output": output,
        })
        await redis.publish(channel, json.dumps({"type": "status", "status": "failed"}))
        await redis.publish(channel, json.dumps({"type": "done"}))
        return

    assert process.stdout is not None
    idle_timeout = settings.ANSIBLE_IDLE_TIMEOUT
    timed_out = False
    while True:
        try:
            chunk = await asyncio.wait_for(process.stdout.read(4096), timeout=idle_timeout)
        except TimeoutError:
            timed_out = True
            msg = f"\n\n[racksmith] No output for {idle_timeout}s — process appears hung, killing.\n"
            output += msg
            await redis.publish(channel, json.dumps({"type": "output", "data": msg}))
            logger.warning(f"{log_event}_idle_timeout", run_id=run_id, idle_timeout=idle_timeout)
            process.kill()
            await process.wait()
            break
        if not chunk:
            break
        text = chunk.decode("utf-8", errors="replace")
        output += text
        await redis.publish(channel, json.dumps({"type": "output", "data": text}))

    if timed_out:
        status = "failed"
        exit_code = -1
    else:
        exit_code = await process.wait()
        status = "completed" if exit_code == 0 else "failed"
    finished_at = now_iso()

    await _update_run(redis, run_id, {
        "status": status, "finished_at": finished_at,
        "exit_code": str(exit_code), "output": output,
    })

    logger.info(f"{log_event}_finished", run_id=run_id, exit_code=exit_code, status=status)
    await redis.publish(channel, json.dumps({"type": "status", "status": status}))
    await redis.publish(channel, json.dumps({"type": "done"}))


async def execute_playbook_run(
    ctx,
    *,
    run_id: str,
    playbook_yaml: str,
    inventory_yaml: str,
    host_vars: dict[str, str],
    group_vars: dict[str, str],
    role_files: dict[str, dict[str, str]],
    hosts: list[str],
    runtime_vars: dict | None = None,
    become: bool = False,
    become_password: str | None = None,
) -> None:
    """Execute ansible-playbook from a serialized payload."""
    logger.info("playbook_run_started", run_id=run_id, hosts=hosts)
    tmpdir = _materialize_workspace(playbook_yaml, inventory_yaml, host_vars, group_vars, role_files)

    try:
        pb = resolve_ansible_cli("ansible-playbook")
        command = [
            pb,
            str(tmpdir / "playbook.yml"),
            "-i", str(tmpdir / "inventory"),
            "--limit", ",".join(hosts),
        ]
        if become:
            command.append("--become")

        _prepare_extra_vars(command, runtime_vars, become_password, tmpdir)

        command_line = f"$ {' '.join(command)}\n"
        if runtime_vars or become_password:
            command_line = "$ ansible-playbook playbook.yml [runtime vars redacted]\n"

        await _run_ansible(
            redis=ctx["redis"],
            run_id=run_id,
            log_event="playbook_run",
            tmpdir=tmpdir,
            command=command,
            command_line=command_line,
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def execute_role_run(
    ctx,
    *,
    run_id: str,
    role_id: str,
    inventory_yaml: str,
    host_vars: dict[str, str],
    group_vars: dict[str, str],
    role_files: dict[str, dict[str, str]],
    hosts: list[str],
    role_vars: dict | None = None,
    become: bool = False,
    runtime_vars: dict | None = None,
    become_password: str | None = None,
) -> None:
    """Execute a single role via ansible-playbook from a serialized payload."""
    logger.info("role_run_started", run_id=run_id, role_id=role_id, hosts=hosts)

    role_entry: dict[str, Any] | str = role_id
    if role_vars:
        role_entry = {"role": role_id, "vars": dict(role_vars)}

    playbook_yaml = yaml.safe_dump([{
        "name": f"Run role: {role_id}",
        "hosts": "all",
        "gather_facts": True,
        "become": become,
        "roles": [role_entry],
    }], sort_keys=False)

    tmpdir = _materialize_workspace(playbook_yaml, inventory_yaml, host_vars, group_vars, role_files)

    try:
        pb = resolve_ansible_cli("ansible-playbook")
        command = [
            pb,
            str(tmpdir / "playbook.yml"),
            "-i", str(tmpdir / "inventory"),
            "--limit", ",".join(hosts),
        ]

        _prepare_extra_vars(command, runtime_vars, become_password, tmpdir)

        command_line = f"$ ansible-playbook [role: {role_id}]\n"
        if runtime_vars or become_password:
            command_line = f"$ ansible-playbook [role: {role_id}] [runtime vars redacted]\n"

        await _run_ansible(
            redis=ctx["redis"],
            run_id=run_id,
            log_event="role_run",
            tmpdir=tmpdir,
            command=command,
            command_line=command_line,
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
