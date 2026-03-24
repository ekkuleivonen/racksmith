"""Ansible bridge — pure functions for Ansible file structures."""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

import yaml as pyyaml
from ruamel.yaml import YAML

from .config import AnsibleLayout, resolve_layout

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def yaml_rt() -> YAML:
    """Round-trip YAML loader that preserves comments and formatting.

    Used for inventory / host_vars / group_vars read-modify-write where
    preserving user comments matters.  For Racksmith-generated files use
    ``atomic_yaml_dump`` instead.
    """
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.default_flow_style = False
    return y


def atomic_yaml_dump(data: object, path: Path) -> None:
    """Dump *data* as YAML to *path* atomically.

    Uses PyYAML (YAML 1.1) so that strings like ``yes``, ``no``,
    ``true``, ``false`` are automatically quoted — matching the parser
    Ansible will use when it reads the file back.

    Writes to a temp file in the same directory, then replaces the target
    via ``os.replace``.  If the dump or write fails, the original file is
    left untouched.
    """
    content = pyyaml.safe_dump(
        data, sort_keys=False, allow_unicode=True, default_flow_style=False
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def validate_safe_id(id_str: str) -> None:
    """Raise ``ValueError`` if *id_str* is unsuitable as a file/dir name.

    Rejects empty strings, path separators, ``..`` components, null bytes,
    and anything that doesn't match ``[A-Za-z0-9][A-Za-z0-9._-]*``.
    """
    if not id_str or not id_str.strip():
        raise ValueError("ID must not be empty")
    if "\x00" in id_str:
        raise ValueError("ID must not contain null bytes")
    if "/" in id_str or "\\" in id_str:
        raise ValueError("ID must not contain path separators")
    if ".." in id_str:
        raise ValueError("ID must not contain '..'")
    if not _SAFE_ID_RE.match(id_str):
        raise ValueError(
            f"ID contains invalid characters: {id_str!r}. "
            f"Must match [A-Za-z0-9][A-Za-z0-9._-]*"
        )


__all__ = [
    "AnsibleLayout",
    "atomic_yaml_dump",
    "resolve_layout",
    "validate_safe_id",
    "yaml_rt",
]
