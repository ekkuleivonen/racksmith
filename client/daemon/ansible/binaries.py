"""Resolve Ansible CLI executables (venv bin first, then PATH)."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


def _venv_scripts_dir() -> Path:
    """Return the ``bin`` (or ``Scripts``) directory for the active venv/prefix."""
    return Path(sys.prefix) / "bin"


def resolve_ansible_cli(name: str) -> str:
    """
    Return a path to an Ansible CLI script (e.g. ``ansible-galaxy``).

    ``sys.prefix`` points to the venv root when running inside one
    (e.g. ``/app/daemon/.venv``), so ``sys.prefix / "bin"`` is where pip/uv
    install console-script entry points like ``ansible-galaxy``.

    ``sys.executable`` is unreliable for this because Python resolves the
    symlink (via ``/proc/self/exe``), landing in ``/usr/local/bin`` instead
    of ``.venv/bin``.
    """
    candidate = _venv_scripts_dir() / name
    if candidate.is_file():
        return str(candidate)

    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(
        f"{name} not found (tried {candidate} and PATH)"
    )
