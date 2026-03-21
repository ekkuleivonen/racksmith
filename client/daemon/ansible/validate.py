"""Validate become (sudo) password via Ansible ad-hoc command."""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path

import yaml
from racksmith_shared.logging import get_logger

import settings
from ansible.collections import COLLECTIONS_DIR
from ssh.misc import _racksmith_ssh_dir

logger = get_logger(__name__)

BECOME_VALIDATION_ERROR = "Invalid sudo password. Please check the password and try again."


async def validate_become_password(
    inventory_yaml: str,
    host_vars: dict[str, str],
    group_vars: dict[str, str],
    hosts: list[str],
    become_password: str,
) -> None:
    """Run ansible ad-hoc to verify sudo password works. Raises ValueError on failure."""
    if not hosts or not become_password.strip():
        return

    tmpdir = Path(tempfile.mkdtemp(prefix="racksmith_validate_"))

    try:
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

        vars_path = tmpdir / "_become_vars.yml"
        vars_path.write_text(yaml.safe_dump({"ansible_become_pass": become_password}))
        os.chmod(str(vars_path), 0o600)

        env = os.environ.copy()
        env["ANSIBLE_COLLECTIONS_PATH"] = str(COLLECTIONS_DIR)
        if settings.SSH_DISABLE_HOST_KEY_CHECK:
            env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
        env["ANSIBLE_FORCE_COLOR"] = "True"
        priv_key = _racksmith_ssh_dir() / "id_ed25519"
        if priv_key.is_file():
            env["ANSIBLE_PRIVATE_KEY_FILE"] = str(priv_key)

        command = [
            "ansible",
            ",".join(hosts),
            "-m", "shell",
            "-a", "whoami",
            "--become",
            "-i", str(inv_dir),
            "-e", f"@{vars_path}",
        ]

        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(tmpdir),
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
            raise ValueError(f"Sudo validation failed: {output[:500] if output else 'unknown error'}")
    except FileNotFoundError:
        raise ValueError("ansible was not found on PATH")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
