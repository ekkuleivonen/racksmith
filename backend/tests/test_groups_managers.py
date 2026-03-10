"""Unit tests for groups/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from groups.managers import group_manager
from groups.schemas import GroupCreate, GroupUpdate


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager.active_repo_path in groups and hosts (get_group uses both)."""
    with patch("groups.managers.repos_manager") as m, patch(
        "hosts.managers.repos_manager"
    ) as m2:
        m.active_repo_path.return_value = repo_path
        m2.active_repo_path.return_value = repo_path
        yield mock_session


class TestGroupManagerListGroups:
    def test_empty_when_no_repo(self, mock_session):
        with patch("groups.managers.repos_manager") as m:
            from github.misc import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = group_manager.list_groups(mock_session)
        assert result == []

    def test_empty_inventory_returns_empty(self, with_repo_mock):
        result = group_manager.list_groups(with_repo_mock)
        assert result == []

    def test_lists_groups_from_inventory(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
  children:
    web:
      hosts:
        web1: {}
""")
        layout.group_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.group_vars_path / "web.yml").write_text("racksmith_name: Web Servers\n")
        result = group_manager.list_groups(with_repo_mock)
        assert len(result) >= 1
        grp = next(g for g in result if g.id == "web")
        assert grp.name == "Web Servers"


class TestGroupManagerCreateGroup:
    def test_create_group(self, with_repo_mock):
        data = GroupCreate(name="Database Servers", description="DB hosts")
        group = group_manager.create_group(with_repo_mock, data)
        assert group.id
        assert group.name == "Database Servers"
        assert group.description == "DB hosts"

    def test_create_group_slug_from_name(self, with_repo_mock):
        data = GroupCreate(name="My Group")
        group = group_manager.create_group(with_repo_mock, data)
        assert "my" in group.id.lower() or "group" in group.id.lower()


class TestGroupManagerGetGroup:
    def test_get_group_with_members(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
  children:
    web:
      hosts:
        web1: {}
""")
        layout.group_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.group_vars_path / "web.yml").write_text("racksmith_name: Web\n")
        result = group_manager.get_group(with_repo_mock, "web")
        assert result.id == "web"
        assert result.name == "Web"
        assert len(result.hosts) == 1
        assert result.hosts[0].id == "web1"

    def test_get_group_not_found_raises(self, with_repo_mock):
        with pytest.raises(KeyError, match="not found"):
            group_manager.get_group(with_repo_mock, "nonexistent")


class TestGroupManagerUpdateGroup:
    def test_update_group(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    web:
      hosts: {}
""")
        layout.group_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.group_vars_path / "web.yml").write_text(
            "racksmith_name: Old Name\nracksmith_description: Old desc\n"
        )
        group = group_manager.update_group(
            with_repo_mock, "web", GroupUpdate(name="New Name", description="New desc")
        )
        assert group.name == "New Name"
        assert group.description == "New desc"


class TestGroupManagerDeleteGroup:
    def test_delete_group(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    web:
      hosts: {}
""")
        layout.group_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.group_vars_path / "web.yml").write_text("racksmith_name: Web\n")
        group_manager.delete_group(with_repo_mock, "web")
        with pytest.raises(KeyError, match="not found"):
            group_manager.get_group(with_repo_mock, "web")
