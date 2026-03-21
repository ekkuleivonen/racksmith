"""SSH connection helpers and utilities."""

from __future__ import annotations

from pathlib import Path

import settings


def _connect_kwargs(host: str, username: str, port: int) -> dict:
    kwargs: dict = {
        "host": host,
        "username": username,
        "port": port,
        "connect_timeout": 10,
        "login_timeout": 10,
    }
    if settings.SSH_DISABLE_HOST_KEY_CHECK:
        kwargs["known_hosts"] = None
    racksmith_priv = _racksmith_ssh_dir() / "id_ed25519"
    if racksmith_priv.is_file():
        kwargs["client_keys"] = [str(racksmith_priv)]
    return kwargs


def _racksmith_ssh_dir() -> Path:
    return Path(settings.DATA_DIR) / ".ssh"
