"""arq job functions for playbook and role execution, and network discovery."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

import yaml

import settings
from _utils.helpers import now_iso
from _utils.logging import get_logger
from _utils.runs import RUN_TTL, run_key
from core import resolve_layout
from hosts.scan import SCAN_KEY_PREFIX, SCAN_TTL
from hosts.ssh_misc import _racksmith_ssh_dir
from worker.ansible import COLLECTIONS_DIR

logger = get_logger(__name__)


async def _update_run(redis, run_id: str, fields: dict[str, str]) -> None:
    """Update run state in Redis hash and refresh TTL."""
    key = run_key(run_id)
    await redis.hset(key, mapping=fields)
    await redis.expire(key, RUN_TTL)


def _ansible_env(ansible_config_path: str, roles_path: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["ANSIBLE_CONFIG"] = ansible_config_path
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


def _cleanup_temp_files(*paths: str | None) -> None:
    for p in paths:
        if p:
            try:
                os.unlink(p)
            except OSError:
                pass


async def _run_ansible(
    *,
    redis,
    run_id: str,
    log_event: str,
    repo_path: str,
    command: list[str],
    command_line: str,
    ansible_config_path: str,
    roles_path: Path,
    temp_files: list[str | None],
) -> None:
    """Shared core: spawn ansible-playbook, stream output via Redis pub/sub, update run status."""
    channel = f"{settings.REDIS_RUN_EVENTS_PREFIX}{run_id}:events"

    await _update_run(redis, run_id, {"status": "running", "started_at": now_iso()})
    await redis.publish(channel, json.dumps({"type": "status", "status": "running"}))
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
        _cleanup_temp_files(*temp_files)
        return

    assert process.stdout is not None
    idle_timeout = settings.ANSIBLE_IDLE_TIMEOUT
    timed_out = False
    while True:
        try:
            chunk = await asyncio.wait_for(
                process.stdout.read(4096), timeout=idle_timeout
            )
        except TimeoutError:
            timed_out = True
            msg = (
                f"\n\n[racksmith] No output for {idle_timeout}s — "
                "process appears hung, killing.\n"
            )
            output += msg
            await redis.publish(channel, json.dumps({"type": "output", "data": msg}))
            logger.warning(
                f"{log_event}_idle_timeout",
                run_id=run_id,
                idle_timeout=idle_timeout,
            )
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
    _cleanup_temp_files(*temp_files)


def _make_ansible_config(roles_path: Path) -> str:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".cfg", delete=False, prefix="racksmith_ansible_"
    ) as f:
        f.write(
            f"[defaults]\nroles_path = {roles_path}\ninterpreter_python = auto_silent\n"
        )
        return f.name


def _prepare_extra_vars(
    command: list[str],
    runtime_vars: dict | None,
    become_password: str | None,
) -> str | None:
    """Append --extra-vars to *command* if needed. Returns temp vars file path or None."""
    extra: dict[str, str] = dict(runtime_vars or {})
    if become_password:
        extra["ansible_become_pass"] = become_password
    if not extra:
        return None
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yml", delete=False, prefix="racksmith_vars_"
    ) as f:
        f.write(yaml.safe_dump(extra))
        tmp_vars_path = f.name
    command += ["--extra-vars", f"@{tmp_vars_path}"]
    return tmp_vars_path


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

    repo = Path(repo_path)
    layout = resolve_layout(repo)
    playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
    if not playbook_path.exists():
        playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
    roles_path = layout.roles_path.resolve()
    ansible_config_path = _make_ansible_config(roles_path)

    command = [
        "ansible-playbook",
        str(playbook_path),
        "-i", str(layout.inventory_path),
        "--limit", ",".join(hosts),
    ]
    if become:
        command.append("--become")

    tmp_vars_path = _prepare_extra_vars(command, runtime_vars, become_password)

    if tmp_vars_path:
        command_line = f"$ {' '.join(command)} [runtime vars redacted]\n"
    else:
        command_line = f"$ {' '.join(command)}\n"

    await _run_ansible(
        redis=ctx["redis"],
        run_id=run_id,
        log_event="playbook_run",
        repo_path=repo_path,
        command=command,
        command_line=command_line,
        ansible_config_path=ansible_config_path,
        roles_path=roles_path,
        temp_files=[ansible_config_path, tmp_vars_path],
    )


async def execute_role_run(
    ctx,
    *,
    run_id: str,
    repo_path: str,
    role_id: str,
    hosts: list[str],
    role_vars: dict | None = None,
    become: bool = False,
    runtime_vars: dict | None = None,
    become_password: str | None = None,
) -> None:
    """Execute a single role as an ansible-playbook run."""
    logger.info("role_run_started", run_id=run_id, role_id=role_id, hosts=hosts)

    repo = Path(repo_path)
    layout = resolve_layout(repo)
    roles_path = layout.roles_path.resolve()

    role_entry: dict | str = role_id
    if role_vars:
        role_entry = {"role": role_id, "vars": dict(role_vars)}

    playbook = [
        {
            "name": f"Run role: {role_id}",
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
    ansible_config_path = _make_ansible_config(roles_path)

    command = [
        "ansible-playbook",
        playbook_path,
        "-i", str(layout.inventory_path),
        "--limit", ",".join(hosts),
    ]

    tmp_vars_path = _prepare_extra_vars(command, runtime_vars, become_password)

    if tmp_vars_path:
        command_line = f"$ ansible-playbook [role: {role_id}] [runtime vars redacted]\n"
    else:
        command_line = f"$ ansible-playbook [role: {role_id}]\n"

    await _run_ansible(
        redis=ctx["redis"],
        run_id=run_id,
        log_event="role_run",
        repo_path=repo_path,
        command=command,
        command_line=command_line,
        ansible_config_path=ansible_config_path,
        roles_path=roles_path,
        temp_files=[playbook_path, ansible_config_path, tmp_vars_path],
    )


# ---------------------------------------------------------------------------
# Network discovery
# ---------------------------------------------------------------------------

async def _update_scan(redis, scan_id: str, fields: dict[str, str]) -> None:
    key = f"{SCAN_KEY_PREFIX}{scan_id}"
    await redis.hset(key, mapping=fields)
    await redis.expire(key, SCAN_TTL)


async def execute_network_scan(
    ctx,
    *,
    scan_id: str,
    subnet: str,
    repo_path: str,
) -> None:
    """ARP-scan the subnet, enrich with vendor/DNS, cross-reference existing hosts."""
    redis = ctx["redis"]
    logger.info("network_scan_started", scan_id=scan_id, subnet=subnet)
    await _update_scan(redis, scan_id, {"status": "running"})

    try:
        from hosts.scan_misc import arp_scan, lookup_vendors, reverse_dns

        loop = asyncio.get_running_loop()
        raw_devices = await loop.run_in_executor(None, arp_scan, subnet)

        if not raw_devices:
            await _update_scan(redis, scan_id, {
                "status": "completed",
                "devices": "[]",
            })
            logger.info("network_scan_completed", scan_id=scan_id, found=0)
            return

        # Phase 1: store raw ARP results immediately so the UI shows progress
        devices: list[dict[str, Any]] = [{"ip": ip, "mac": mac} for ip, mac in raw_devices]
        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        # Phase 2: vendor lookup (batch)
        macs = [mac for _, mac in raw_devices]
        vendors = await loop.run_in_executor(None, lookup_vendors, macs)
        for d in devices:
            d["vendor"] = vendors.get(d["mac"], "")

        # Phase 3: reverse DNS (best-effort, parallelised)
        async def _rdns(ip: str) -> str:
            return await loop.run_in_executor(None, reverse_dns, ip)

        hostnames = await asyncio.gather(*[_rdns(ip) for ip, _ in raw_devices])
        for d, hostname in zip(devices, hostnames):
            d["hostname"] = hostname

        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        # Phase 4: cross-reference against existing hosts
        try:
            from core.inventory import read_hosts

            layout = resolve_layout(Path(repo_path))
            existing_hosts = read_hosts(layout)

            mac_map: dict[str, str] = {}
            ip_map: dict[str, str] = {}
            for h in existing_hosts:
                r = h.racksmith
                if r.get("mac_address"):
                    mac_map[r["mac_address"].lower()] = h.id
                if h.ansible_host:
                    ip_map[h.ansible_host] = h.id

            for d in devices:
                mac_lower = d["mac"].lower()
                existing_id = mac_map.get(mac_lower) or ip_map.get(d["ip"])
                if existing_id:
                    d["already_imported"] = True
                    d["existing_host_id"] = existing_id
        except Exception:
            logger.debug("scan_cross_reference_failed", scan_id=scan_id, exc_info=True)

        await _update_scan(redis, scan_id, {
            "status": "completed",
            "devices": json.dumps(devices),
        })
        logger.info("network_scan_completed", scan_id=scan_id, found=len(devices))

    except Exception as exc:
        logger.error("network_scan_failed", scan_id=scan_id, error=str(exc), exc_info=True)
        await _update_scan(redis, scan_id, {
            "status": "failed",
            "error": str(exc),
        })
