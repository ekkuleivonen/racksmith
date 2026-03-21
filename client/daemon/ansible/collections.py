"""Ansible Galaxy collection management."""

from __future__ import annotations

import asyncio
from pathlib import Path

from racksmith_shared.logging import get_logger

import settings
from ansible.binaries import resolve_ansible_cli

logger = get_logger(__name__)

COLLECTIONS_DIR = Path.home() / ".ansible" / "collections"


async def install_ansible_collections_on_startup(
    extensions: list[str] | None = None,
) -> None:
    collections = extensions if extensions is not None else settings.ANSIBLE_EXTENSIONS
    if not collections:
        logger.info("ansible_extensions_empty")
        return

    logger.info("ansible_extensions_install_start", collections=collections)
    galaxy = resolve_ansible_cli("ansible-galaxy")
    process = await asyncio.create_subprocess_exec(
        galaxy, "collection", "install",
        "-p", str(COLLECTIONS_DIR),
        *collections,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await process.communicate()
    output = stdout.decode("utf-8", errors="replace").strip()

    if process.returncode != 0:
        logger.error("ansible_extensions_install_failed", return_code=process.returncode, output=output)
        raise RuntimeError("Failed to install Ansible collections")

    logger.info("ansible_extensions_install_done", return_code=process.returncode, output=output)
