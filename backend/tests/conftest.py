"""Shared pytest fixtures for backend module tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from ansible import AnsibleLayout, resolve_layout


@pytest.fixture
def mock_session():
    """Session-like object with user_id and access_token."""
    return type("Session", (), {
        "user": {"id": "test-user-123", "login": "test", "name": "Test User"},
        "access_token": "gh_test_token",
    })()


@pytest.fixture
def repo_path(tmp_path: Path) -> Path:
    """Empty dir as repo root; .racksmith/ structure created on demand."""
    return tmp_path


@pytest.fixture
def layout(repo_path: Path) -> AnsibleLayout:
    """Resolved AnsibleLayout for the test repo."""
    return resolve_layout(repo_path)


@pytest.fixture
def workspace_with_repo(tmp_path: Path, monkeypatch):
    """Set REPOS_WORKSPACE to tmp_path; create user dir, repo, and active binding."""
    import json

    ws = tmp_path / "workspace"
    ws.mkdir()
    user_dir = ws / "test-user-123"
    user_dir.mkdir()
    repo_dir = user_dir / "owner_repo"
    repo_dir.mkdir()
    binding_path = user_dir / ".racksmith-user.json"
    binding_path.write_text(
        json.dumps({"user_id": "test-user-123", "owner": "owner", "repo": "repo"}, indent=2),
        encoding="utf-8",
    )
    import settings
    monkeypatch.setattr(settings, "REPOS_WORKSPACE", str(ws))
    return ws, user_dir, repo_dir
