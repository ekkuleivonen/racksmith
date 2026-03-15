"""Custom domain exceptions for consistent error handling."""

from __future__ import annotations


class NotFoundError(Exception):
    """Resource does not exist."""


class AlreadyExistsError(Exception):
    """Resource already exists (conflict on create)."""


class RepoNotAvailableError(Exception):
    """Raised when the active repo is not configured or missing from disk."""
