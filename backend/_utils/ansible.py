"""Ansible runtime helpers."""

from __future__ import annotations

import asyncio
from pathlib import Path

from _utils.logging import get_logger

logger = get_logger(__name__)

_DEFAULT_COLLECTIONS_REQUIREMENTS = (
    Path(__file__).resolve().parents[2] / ".racksmith" / "collections" / "requirements.yml"
)


async def install_ansible_collections_on_startup(
    requirements_path: Path = _DEFAULT_COLLECTIONS_REQUIREMENTS,
) -> None:
    """Install Ansible collections declared in requirements file."""
    if not requirements_path.is_file():
        logger.warning(
            "ansible_collections_requirements_missing",
            path=str(requirements_path),
        )
        return

    logger.info(
        "ansible_collections_install_start",
        requirements=str(requirements_path),
    )
    process = await asyncio.create_subprocess_exec(
        "ansible-galaxy",
        "collection",
        "install",
        "-r",
        str(requirements_path),
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
