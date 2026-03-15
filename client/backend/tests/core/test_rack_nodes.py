"""Unit tests for ansible.rack_nodes."""

from conftest import write_racksmith_yml as _write_racksmith_yml

from core.rack_nodes import (
    RackNodeData,
    read_rack_node,
    read_rack_nodes,
    remove_rack_node,
    write_rack_node,
)


class TestReadRackNodes:
    """read_rack_nodes(layout)."""

    def test_empty_when_no_file(self, layout) -> None:
        assert read_rack_nodes(layout) == []

    def test_parses_rack_nodes_from_meta(self, layout) -> None:
        _write_racksmith_yml(layout, {
            "schema_version": 3,
            "rack_nodes": {
                "patch-panel": {
                    "name": "patch panel",
                    "notes": "",
                    "labels": [],
                    "mac_address": "",
                    "rack": "rack_1cd22b",
                    "position_u_start": 12,
                    "position_u_height": 1,
                    "position_col_start": 0,
                    "position_col_count": 12,
                },
            },
        })
        nodes = read_rack_nodes(layout)
        assert len(nodes) == 1
        d = nodes[0]
        assert d.id == "patch-panel"
        assert d.name == "patch panel"
        assert d.rack == "rack_1cd22b"
        assert d.position_u_start == 12
        assert d.position_u_height == 1
        assert d.position_col_start == 0
        assert d.position_col_count == 12

    def test_uses_defaults_for_missing_fields(self, layout) -> None:
        _write_racksmith_yml(layout, {
            "schema_version": 3,
            "rack_nodes": {"minimal": {}},
        })
        nodes = read_rack_nodes(layout)
        assert len(nodes) == 1
        assert nodes[0].id == "minimal"
        assert nodes[0].name == "minimal"
        assert nodes[0].position_u_start == 1


class TestReadRackNode:
    """read_rack_node(layout, node_id)."""

    def test_returns_none_when_missing(self, layout) -> None:
        assert read_rack_node(layout, "nonexistent") is None

    def test_returns_node_when_exists(self, layout) -> None:
        _write_racksmith_yml(layout, {
            "schema_version": 3,
            "rack_nodes": {
                "ups1": {"name": "UPS", "rack": "rack_1"},
            },
        })
        d = read_rack_node(layout, "ups1")
        assert d is not None
        assert d.id == "ups1"
        assert d.name == "UPS"


class TestWriteRackNode:
    """write_rack_node(layout, node)."""

    def test_creates_file_if_missing(self, layout) -> None:
        node = RackNodeData(
            id="racknode_abc123",
            name="Test Device",
            rack="rack_1",
            position_u_start=5,
        )
        write_rack_node(layout, node)
        meta_path = layout.racksmith_base / ".racksmith.yml"
        assert meta_path.is_file()
        nodes = read_rack_nodes(layout)
        assert len(nodes) == 1
        assert nodes[0].id == "racknode_abc123"
        assert nodes[0].name == "Test Device"

    def test_roundtrip(self, layout) -> None:
        original = RackNodeData(
            id="racknode_rt",
            name="Roundtrip Node",
            rack="rack_1",
            position_u_start=5,
            position_u_height=2,
            position_col_start=1,
            position_col_count=6,
        )
        write_rack_node(layout, original)
        read_back = read_rack_node(layout, "racknode_rt")
        assert read_back is not None
        assert read_back.id == original.id
        assert read_back.name == original.name
        assert read_back.rack == original.rack
        assert read_back.position_u_start == original.position_u_start
        assert read_back.position_u_height == original.position_u_height


class TestRemoveRackNode:
    """remove_rack_node(layout, node_id)."""

    def test_noop_when_file_missing(self, layout) -> None:
        remove_rack_node(layout, "any")

    def test_removes_node(self, layout) -> None:
        _write_racksmith_yml(layout, {
            "schema_version": 3,
            "rack_nodes": {"d1": {"name": "Device 1"}},
        })
        remove_rack_node(layout, "d1")
        assert read_rack_nodes(layout) == []
