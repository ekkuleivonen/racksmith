"""Shared helpers for resolving session → repo → layout."""

from __future__ import annotations

from _utils.exceptions import RepoNotAvailableError
from auth.session import SessionData
from core import resolve_layout
from core.config import AnsibleLayout
from repo.managers import repos_manager


def get_layout(session: SessionData) -> AnsibleLayout:
    """Get the Ansible layout for the active repo, or raise RepoNotAvailableError."""
    repo_path = repos_manager.active_repo_path(session)
    return resolve_layout(repo_path)


def get_layout_or_none(session: SessionData) -> AnsibleLayout | None:
    """Get the Ansible layout, or None if no repo is active."""
    try:
        return get_layout(session)
    except RepoNotAvailableError:
        return None
