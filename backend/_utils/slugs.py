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


def validate_slug(slug: str) -> None:
    """Raise ValueError if slug is invalid."""
    if not SLUG_RE.match(slug):
        raise ValueError(
            "slug must be lowercase letters, numbers, hyphens, or underscores "
            "and must start with a letter or number"
        )
