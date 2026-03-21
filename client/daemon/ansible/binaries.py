"""Resolve Ansible CLI executables (venv bin first, then PATH)."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


def resolve_ansible_cli(name: str) -> str:
    """
    Return a path to an Ansible CLI script (e.g. ``ansible-galaxy``).

    Prefer the directory next to ``sys.executable`` so supervisor/Docker runs work
    without relying on PATH (ansible-core installs scripts into the venv ``bin``).
    """
    bin_dir = Path(sys.executable).resolve().parent
    candidate = bin_dir / name
    if candidate.is_file():
        return str(candidate)
    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(f"{name} not found (expected at {candidate} or on PATH)")
