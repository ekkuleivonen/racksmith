"""Ansible ad-hoc execution for validation (e.g. sudo password check)."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import yaml
import settings
from ansible import resolve_layout
from ssh.misc import _racksmith_ssh_dir


BECOME_VALIDATION_ERROR = "Invalid sudo password. Please check the password and try again."


def _ansible_env(ansible_config_path: str, roles_path: Path) -> dict[str, str]:
    """Build env for ansible commands (matches worker/functions)."""
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


async def validate_become_password(
    repo_path: Path,
    hosts: list[str],
    become_password: str,
) -> None:
    """Run ansible ad-hoc to verify sudo password works. Raises ValueError on failure."""
    if not hosts or not become_password.strip():
        return
    repo_path = Path(repo_path)
    layout = resolve_layout(repo_path)
    roles_path = layout.roles_path.resolve()
    inventory_path = layout.inventory_path

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".cfg", delete=False, prefix="racksmith_validate_"
    ) as f:
        f.write(f"[defaults]\nroles_path = {roles_path}\n")
        ansible_config_path = f.name

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yml", delete=False, prefix="racksmith_validate_"
    ) as f:
        f.write(yaml.safe_dump({"ansible_become_pass": become_password}))
        vars_path = f.name

    try:
        command = [
            "ansible",
            ",".join(hosts),
            "-m",
            "shell",
            "-a",
            "whoami",
            "--become",
            "-i",
            str(inventory_path),
            "-e",
            f"@{vars_path}",
        ]
        env = _ansible_env(ansible_config_path, roles_path)
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(repo_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        stdout, _ = await process.communicate()
        exit_code = process.returncode

        if exit_code != 0:
            output = stdout.decode("utf-8", errors="replace")
            if any(
                msg in output.lower()
                for msg in (
                    "sudo: a password is required",
                    "sudo: no password was provided",
                    "sorry, try again",
                    "incorrect password",
                )
            ):
                raise ValueError(BECOME_VALIDATION_ERROR)
            raise ValueError(
                f"Sudo validation failed: {output[:500] if output else 'unknown error'}"
            )
    except FileNotFoundError:
        raise ValueError("ansible was not found on PATH")
    finally:
        for p in (ansible_config_path, vars_path):
            try:
                os.unlink(p)
            except OSError:
                pass
