"""Unit tests for racks/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from racks.managers import rack_manager
from racks.schemas import RackCreate, RackUpdate


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager.active_repo_path in racks and hosts (get_layout uses both)."""
    with patch("racks.managers.repos_manager") as m, patch(
        "hosts.managers.repos_manager"
    ) as m2:
        m.active_repo_path.return_value = repo_path
        m2.active_repo_path.return_value = repo_path
        yield mock_session


class TestRackManagerListRacks:
    def test_empty_when_no_repo(self, mock_session):
        with patch("racks.managers.repos_manager") as m:
            from github.misc import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = rack_manager.list_racks(mock_session)
        assert result == []

    def test_empty_returns_empty(self, with_repo_mock):
        result = rack_manager.list_racks(with_repo_mock)
        assert result == []

    def test_lists_racks_from_racks_yml(self, with_repo_mock, layout):
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r_abc123:
  name: Rack 1
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 12
  created_at: "2024-01-01T00:00:00"
  updated_at: "2024-01-01T00:00:00"
""")
        result = rack_manager.list_racks(with_repo_mock)
        assert len(result) == 1
        assert result[0].id == "r_abc123"
        assert result[0].name == "Rack 1"


class TestRackManagerCreateRack:
    def test_create_rack(self, with_repo_mock):
        data = RackCreate(name="Rack 1", rack_width_inches=19, rack_units=12)
        rack = rack_manager.create_rack(with_repo_mock, data)
        assert rack.id.startswith("r_")
        assert rack.name == "Rack 1"
        assert rack.rack_units == 12
        assert rack.rack_width_inches == 19

    def test_create_rack_invalid_width_raises(self, with_repo_mock):
        # 15 is valid for Pydantic (1-30) but racks.misc validates 10, 19, 23 only
        data = RackCreate(name="Bad", rack_width_inches=15, rack_units=12)
        with pytest.raises(ValueError, match="rack_width_inches"):
            rack_manager.create_rack(with_repo_mock, data)


class TestRackManagerGetRack:
    def test_get_rack_found(self, with_repo_mock, layout):
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r_abc:
  name: Rack 1
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 12
  created_at: "2024-01-01T00:00:00"
  updated_at: "2024-01-01T00:00:00"
""")
        rack = rack_manager.get_rack(with_repo_mock, "r_abc")
        assert rack.id == "r_abc"
        assert rack.name == "Rack 1"

    def test_get_rack_not_found_raises(self, with_repo_mock):
        with pytest.raises(KeyError, match="not found"):
            rack_manager.get_rack(with_repo_mock, "nonexistent")


class TestRackManagerGetLayout:
    def test_get_layout_with_hosts(self, with_repo_mock, layout):
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r_abc:
  name: Rack 1
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 12
  created_at: "2024-01-01T00:00:00"
  updated_at: "2024-01-01T00:00:00"
""")
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("""
racksmith_name: Web1
racksmith_rack: r_abc
racksmith_position_u_start: 1
racksmith_position_u_height: 1
""")
        layout_data = rack_manager.get_layout(with_repo_mock, "r_abc")
        assert layout_data.id == "r_abc"
        assert len(layout_data.hosts) == 1
        assert layout_data.hosts[0].id == "web1"


class TestRackManagerUpdateRack:
    def test_update_rack(self, with_repo_mock, layout):
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r_abc:
  name: Old Name
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 12
  created_at: "2024-01-01T00:00:00"
  updated_at: "2024-01-01T00:00:00"
""")
        rack = rack_manager.update_rack(
            with_repo_mock, "r_abc", RackUpdate(name="New Name")
        )
        assert rack.name == "New Name"


class TestRackManagerDeleteRack:
    def test_delete_rack(self, with_repo_mock, layout):
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r_abc:
  name: Rack 1
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 12
  created_at: "2024-01-01T00:00:00"
  updated_at: "2024-01-01T00:00:00"
""")
        rack_manager.delete_rack(with_repo_mock, "r_abc")
        with pytest.raises(KeyError, match="not found"):
            rack_manager.get_rack(with_repo_mock, "r_abc")
