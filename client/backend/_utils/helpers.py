"""Shared helper functions used across modules."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Callable
from datetime import UTC, datetime


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def generate_unique_id(
    prefix: str,
    exists: Callable[[str], bool],
    max_attempts: int = 100,
) -> str:
    """Generate a unique ID like ``{prefix}_{6-hex-chars}`` that doesn't collide.

    *exists* is called with each candidate — return ``True`` if already taken.
    """
    for _ in range(max_attempts):
        candidate = f"{prefix}_{secrets.token_hex(3)}"
        if not exists(candidate):
            return candidate
    raise RuntimeError(f"Failed to generate unique {prefix} ID")
