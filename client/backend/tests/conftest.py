"""Shared pytest fixtures for backend module tests."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from core import AnsibleLayout, resolve_layout


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


@pytest.fixture
def _repo_helpers_mock(mock_session, repo_path):
    """Patch repos_manager in _utils.repo_helpers so all managers resolve to repo_path."""
    with patch("_utils.repo_helpers.repos_manager") as m:
        m.active_repo_path.return_value = repo_path
        yield mock_session


@pytest.fixture
def with_hosts_repo_mock(_repo_helpers_mock):
    return _repo_helpers_mock


@pytest.fixture
def with_groups_repo_mock(_repo_helpers_mock):
    return _repo_helpers_mock


@pytest.fixture
def with_racks_repo_mock(_repo_helpers_mock):
    return _repo_helpers_mock


@pytest.fixture
def with_roles_repo_mock(_repo_helpers_mock):
    return _repo_helpers_mock


@pytest.fixture
def with_playbooks_repo_mock(_repo_helpers_mock):
    return _repo_helpers_mock


def write_racksmith_yml(layout: AnsibleLayout, data: dict) -> None:
    """Write .racksmith.yml with arbitrary data (shared test helper)."""
    path = layout.racksmith_base / ".racksmith.yml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))
