"""Shared slug validation and slugify helpers."""

from __future__ import annotations

import re

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def slugify(name: str, *, separator: str = "-", max_length: int = 120) -> str:
    """Convert name to a valid slug.

    Args:
        name: Input string (e.g. group name, hostname).
        separator: Character to replace non-alphanumeric runs with ('-' or '_').
        max_length: Maximum length of the result.
    """
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9_-]+", separator, slug)
    slug = slug.strip(separator)
    if not slug or not SLUG_RE.match(slug):
        return ""
    return slug[:max_length]


def safe_slug(value: str) -> str:
    """Coerce a user-supplied string into a URL/filename-safe slug.

    Unlike ``slugify``, this always returns a non-empty string (falls back
    to ``"rack"``).
    """
    slug = re.sub(r"[^a-zA-Z0-9-]+", "-", value.strip().lower()).strip("-")
    return slug or "rack"


def validate_slug(slug: str) -> None:
    """Raise ValueError if slug is invalid."""
    if not SLUG_RE.match(slug):
        raise ValueError(
            "slug must be lowercase letters, numbers, hyphens, or underscores "
            "and must start with a letter or number"
        )


def humanize_key(key: str) -> str:
    """Turn a snake_case or kebab-case key into a human-readable label.

    ``"enable_pubkey"`` → ``"Enable Pubkey"``
    """
    return key.replace("_", " ").replace("-", " ").strip().title()
