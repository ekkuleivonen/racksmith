"""Unit tests for ansible.racksmith_meta — central metadata store."""

import yaml

from core.racksmith_meta import (
    RacksmithMeta,
    get_host_meta,
    get_playbook_meta,
    get_rack_meta,
    get_rack_node_meta,
    get_role_meta,
    read_meta,
    remove_host_meta,
    remove_playbook_meta,
    remove_rack_meta,
    remove_rack_node_meta,
    remove_role_meta,
    set_host_meta,
    set_playbook_meta,
    set_rack_meta,
    set_rack_node_meta,
    set_role_meta,
    write_meta,
)


def _meta_path(layout):
    return layout.racksmith_base / ".racksmith.yml"


class TestReadMeta:
    """read_meta(layout)."""

    def test_returns_defaults_when_no_file(self, layout) -> None:
        meta = read_meta(layout)
        assert meta.schema_version == 0
        assert meta.hosts == {}
        assert meta.racks == {}
        assert meta.rack_nodes == {}
        assert meta.roles == {}
        assert meta.playbooks == {}

    def test_parses_racksmith_yml(self, layout) -> None:
        path = _meta_path(layout)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump({
            "schema_version": 3,
            "racksmith_version": "1.0.0",
            "racks": {"r1": {"name": "Rack 1", "rack_units": 42}},
        }))
        meta = read_meta(layout)
        assert meta.schema_version == 3
        assert meta.racksmith_version == "1.0.0"
        assert meta.racks["r1"]["rack_units"] == 42

    def test_handles_invalid_yaml(self, layout) -> None:
        path = _meta_path(layout)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not valid: yaml: [")
        meta = read_meta(layout)
        assert meta.schema_version == 0

    def test_handles_non_dict_root(self, layout) -> None:
        path = _meta_path(layout)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("- list\n")
        meta = read_meta(layout)
        assert meta.schema_version == 0


class TestWriteMeta:
    """write_meta(layout, meta)."""

    def test_creates_file(self, layout) -> None:
        meta = RacksmithMeta()
        meta.racks["r1"] = {"name": "Rack 1"}
        write_meta(layout, meta)
        assert _meta_path(layout).is_file()

    def test_roundtrip(self, layout) -> None:
        original = RacksmithMeta(
            schema_version=3,
            racksmith_version="1.0.0",
            hosts={"web1": {"rack": "r1", "position_u_start": 5}},
            roles={"r1": {"slug": "r1"}},
            playbooks={"p1": {"name": "P1"}},
            racks={"rack1": {"name": "Rack 1"}},
            rack_nodes={"node1": {"name": "Node 1"}},
        )
        write_meta(layout, original)
        read_back = read_meta(layout)
        assert read_back.schema_version == 3
        assert read_back.racksmith_version == "1.0.0"
        assert read_back.hosts == original.hosts
        assert read_back.roles == original.roles
        assert read_back.playbooks == original.playbooks
        assert read_back.racks == original.racks
        assert read_back.rack_nodes == original.rack_nodes

    def test_omits_empty_sections(self, layout) -> None:
        meta = RacksmithMeta()
        write_meta(layout, meta)
        content = _meta_path(layout).read_text()
        assert "racks" not in content


class TestHostMetaHelpers:
    def test_get_set_remove(self) -> None:
        meta = RacksmithMeta()
        assert get_host_meta(meta, "web1") == {}
        set_host_meta(meta, "web1", {"rack": "r1", "position_u_start": 5})
        assert get_host_meta(meta, "web1") == {"rack": "r1", "position_u_start": 5}
        remove_host_meta(meta, "web1")
        assert get_host_meta(meta, "web1") == {}


class TestRoleMetaHelpers:
    def test_get_set_remove(self) -> None:
        meta = RacksmithMeta()
        assert get_role_meta(meta, "r1") == {}
        set_role_meta(meta, "r1", {"slug": "nginx"})
        assert get_role_meta(meta, "r1") == {"slug": "nginx"}
        remove_role_meta(meta, "r1")
        assert get_role_meta(meta, "r1") == {}


class TestPlaybookMetaHelpers:
    def test_get_set_remove(self) -> None:
        meta = RacksmithMeta()
        assert get_playbook_meta(meta, "p1") == {}
        set_playbook_meta(meta, "p1", {"description": "Deploy"})
        assert get_playbook_meta(meta, "p1") == {"description": "Deploy"}
        remove_playbook_meta(meta, "p1")
        assert get_playbook_meta(meta, "p1") == {}


class TestRackMetaHelpers:
    def test_get_set_remove(self) -> None:
        meta = RacksmithMeta()
        assert get_rack_meta(meta, "rack1") == {}
        set_rack_meta(meta, "rack1", {"name": "Rack 1", "rack_units": 42})
        assert get_rack_meta(meta, "rack1") == {"name": "Rack 1", "rack_units": 42}
        remove_rack_meta(meta, "rack1")
        assert get_rack_meta(meta, "rack1") == {}


class TestRackNodeMetaHelpers:
    def test_get_set_remove(self) -> None:
        meta = RacksmithMeta()
        assert get_rack_node_meta(meta, "n1") == {}
        set_rack_node_meta(meta, "n1", {"name": "Switch", "rack": "rack_1"})
        assert get_rack_node_meta(meta, "n1") == {"name": "Switch", "rack": "rack_1"}
        remove_rack_node_meta(meta, "n1")
        assert get_rack_node_meta(meta, "n1") == {}


class TestMetaPersistence:
    """End-to-end: write + read via filesystem."""

    def test_multiple_entities_coexist(self, layout) -> None:
        meta = read_meta(layout)
        set_host_meta(meta, "web1", {"rack": "r1", "position_u_start": 5})
        set_rack_meta(meta, "r1", {"name": "R"})
        set_rack_node_meta(meta, "n1", {"name": "N"})
        write_meta(layout, meta)
        meta2 = read_meta(layout)
        assert get_host_meta(meta2, "web1") == {"rack": "r1", "position_u_start": 5}
        assert get_rack_meta(meta2, "r1") == {"name": "R"}
        assert get_rack_node_meta(meta2, "n1") == {"name": "N"}
