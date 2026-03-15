"""Unit tests for groups/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import yaml

from _utils.exceptions import NotFoundError
from groups.managers import group_manager
from groups.schemas import GroupCreate, GroupUpdate


def _set_group_racksmith(layout, group_id: str, data: dict) -> None:
    """Write racksmith_ prefixed keys to group_vars/{group_id}.yml."""
    path = layout.group_vars_file(group_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if path.is_file():
        existing = yaml.safe_load(path.read_text()) or {}
    for k, v in data.items():
        existing[f"racksmith_{k}"] = v
    path.write_text(yaml.safe_dump(existing, sort_keys=False))


@pytest.fixture
def with_repo_mock(with_groups_repo_mock):
    return with_groups_repo_mock


class TestGroupManagerListGroups:
    def test_empty_when_no_repo(self, mock_session):
        with patch("_utils.repo_helpers.repos_manager") as m:
            from _utils.exceptions import RepoNotAvailableError
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
        _set_group_racksmith(layout, "web", {"name": "Web Servers"})
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
        _set_group_racksmith(layout, "web", {"name": "Web"})
        result = group_manager.get_group(with_repo_mock, "web")
        assert result.id == "web"
        assert result.name == "Web"
        assert len(result.hosts) == 1
        assert result.hosts[0].id == "web1"

    def test_get_group_not_found_raises(self, with_repo_mock):
        with pytest.raises(NotFoundError, match="not found"):
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
        _set_group_racksmith(layout, "web", {"name": "Old Name", "description": "Old desc"})
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
        _set_group_racksmith(layout, "web", {"name": "Web"})
        group_manager.delete_group(with_repo_mock, "web")
        with pytest.raises(NotFoundError, match="not found"):
            group_manager.get_group(with_repo_mock, "web")


class TestGroupVars:
    def test_create_group_with_vars(self, with_repo_mock, layout):
        data = GroupCreate(name="DB", vars={"db_port": "5432", "db_name": "app"})
        group = group_manager.create_group(with_repo_mock, data)
        assert group.vars == {"db_port": "5432", "db_name": "app"}

        gv = yaml.safe_load(layout.group_vars_file(group.id).read_text())
        assert gv["db_port"] == "5432"
        assert gv["db_name"] == "app"

    def test_update_group_vars(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    web:
      hosts: {}
""")
        _set_group_racksmith(layout, "web", {"name": "Web"})
        group = group_manager.update_group(
            with_repo_mock, "web", GroupUpdate(vars={"http_port": "8080"})
        )
        assert group.vars == {"http_port": "8080"}

    def test_vars_roundtrip(self, with_repo_mock, layout):
        data = GroupCreate(name="Cache", vars={"ttl": "300"})
        group = group_manager.create_group(with_repo_mock, data)
        fetched = group_manager.get_group(with_repo_mock, group.id)
        assert fetched.vars == {"ttl": "300"}

    def test_update_vars_to_empty(self, with_repo_mock, layout):
        data = GroupCreate(name="Temp", vars={"k": "v"})
        group = group_manager.create_group(with_repo_mock, data)
        group_manager.update_group(with_repo_mock, group.id, GroupUpdate(vars={}))
        fetched = group_manager.get_group(with_repo_mock, group.id)
        assert fetched.vars == {}
