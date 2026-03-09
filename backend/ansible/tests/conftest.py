"""Pytest configuration and shared fixtures."""

from pathlib import Path

import pytest

from ansible import AnsibleLayout, resolve_layout


@pytest.fixture
def repo_path(tmp_path: Path) -> Path:
    """Empty repo directory for tests."""
    return tmp_path


@pytest.fixture
def layout(repo_path: Path) -> AnsibleLayout:
    """Resolved AnsibleLayout for the test repo."""
    return resolve_layout(repo_path)
