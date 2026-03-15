"""Unit tests for racks/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import yaml

from _utils.exceptions import NotFoundError
from core.racks import RackData, write_rack
from racks.managers import rack_manager
from racks.schemas import RackCreate, RackUpdate


@pytest.fixture
def with_repo_mock(with_racks_repo_mock):
    return with_racks_repo_mock


class TestRackManagerListRacks:
    def test_empty_when_no_repo(self, mock_session):
        with patch("_utils.repo_helpers.repos_manager") as m:
            from _utils.exceptions import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = rack_manager.list_racks(mock_session)
        assert result == []

    def test_empty_returns_empty(self, with_repo_mock):
        result = rack_manager.list_racks(with_repo_mock)
        assert result == []

    def test_lists_racks_from_meta(self, with_repo_mock, layout):
        write_rack(layout, RackData(
            id="rack_abc123",
            name="Rack 1",
            rack_units=12,
            rack_width_inches=19,
            rack_cols=12,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00",
        ))
        result = rack_manager.list_racks(with_repo_mock)
        assert len(result) == 1
        assert result[0].id == "rack_abc123"
        assert result[0].name == "Rack 1"


class TestRackManagerCreateRack:
    def test_create_rack(self, with_repo_mock):
        data = RackCreate(name="Rack 1", rack_width_inches=19, rack_units=12)
        rack = rack_manager.create_rack(with_repo_mock, data)
        assert rack.id.startswith("rack_")
        assert rack.name == "Rack 1"
        assert rack.rack_units == 12
        assert rack.rack_width_inches == 19

    def test_create_rack_invalid_width_raises(self, with_repo_mock):
        data = RackCreate(name="Bad", rack_width_inches=15, rack_units=12)
        with pytest.raises(ValueError, match="rack_width_inches"):
            rack_manager.create_rack(with_repo_mock, data)


class TestRackManagerGetRack:
    def test_get_rack_found(self, with_repo_mock, layout):
        write_rack(layout, RackData(
            id="rack_abc",
            name="Rack 1",
            rack_units=12,
            rack_width_inches=19,
            rack_cols=12,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00",
        ))
        rack = rack_manager.get_rack(with_repo_mock, "rack_abc")
        assert rack.id == "rack_abc"
        assert rack.name == "Rack 1"

    def test_get_rack_not_found_raises(self, with_repo_mock):
        with pytest.raises(NotFoundError, match="not found"):
            rack_manager.get_rack(with_repo_mock, "nonexistent")


class TestRackManagerGetLayout:
    def test_get_layout_with_hosts(self, with_repo_mock, layout):
        write_rack(layout, RackData(
            id="rack_abc",
            name="Rack 1",
            rack_units=12,
            rack_width_inches=19,
            rack_cols=12,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00",
        ))
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        hv_path = layout.host_vars_file("web1")
        hv_path.parent.mkdir(parents=True, exist_ok=True)
        hv_path.write_text(yaml.safe_dump({
            "racksmith_name": "Web1",
        }))
        meta_path = layout.racksmith_base / ".racksmith.yml"
        meta_data: dict = {}
        if meta_path.is_file():
            meta_data = yaml.safe_load(meta_path.read_text()) or {}
        meta_data.setdefault("hosts", {})["web1"] = {
            "rack": "rack_abc",
            "position_u_start": 1,
            "position_u_height": 1,
        }
        meta_path.write_text(yaml.safe_dump(meta_data, sort_keys=False))
        layout_data = rack_manager.get_layout(with_repo_mock, "rack_abc")
        assert layout_data.id == "rack_abc"
        assert len(layout_data.hosts) == 1
        assert layout_data.hosts[0].id == "web1"


class TestRackManagerUpdateRack:
    def test_update_rack(self, with_repo_mock, layout):
        write_rack(layout, RackData(
            id="rack_abc",
            name="Old Name",
            rack_units=12,
            rack_width_inches=19,
            rack_cols=12,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00",
        ))
        rack = rack_manager.update_rack(
            with_repo_mock, "rack_abc", RackUpdate(name="New Name")
        )
        assert rack.name == "New Name"


class TestRackManagerDeleteRack:
    def test_delete_rack(self, with_repo_mock, layout):
        write_rack(layout, RackData(
            id="rack_abc",
            name="Rack 1",
            rack_units=12,
            rack_width_inches=19,
            rack_cols=12,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00",
        ))
        rack_manager.delete_rack(with_repo_mock, "rack_abc")
        with pytest.raises(NotFoundError, match="not found"):
            rack_manager.get_rack(with_repo_mock, "rack_abc")
