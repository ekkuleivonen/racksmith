"""Ansible runtime helpers."""

from __future__ import annotations

import asyncio
from pathlib import Path

import settings
from _utils.logging import get_logger

logger = get_logger(__name__)


def _resolve_collections_requirements() -> Path:
    """Resolve collections requirements path from settings or default."""
    p = settings.ANSIBLE_COLLECTIONS_REQUIREMENTS
    if not Path(p).is_absolute():
        return (Path.cwd() / p).resolve()
    return Path(p).resolve()


async def install_ansible_collections_on_startup(
    requirements_path: Path | None = None,
) -> None:
    """Install Ansible collections declared in requirements file."""
    path = requirements_path if requirements_path is not None else _resolve_collections_requirements()
    if not path.is_file():
        logger.warning(
            "ansible_collections_requirements_missing",
            path=str(path),
        )
        return

    logger.info(
        "ansible_collections_install_start",
        requirements=str(path),
    )
    process = await asyncio.create_subprocess_exec(
        "ansible-galaxy",
        "collection",
        "install",
        "-r",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await process.communicate()
    output = stdout.decode("utf-8", errors="replace").strip()

    if process.returncode != 0:
        logger.error(
            "ansible_collections_install_failed",
            return_code=process.returncode,
            output=output,
        )
        raise RuntimeError("Failed to install Ansible collections")

    logger.info(
        "ansible_collections_install_done",
        return_code=process.returncode,
        output=output,
    )
