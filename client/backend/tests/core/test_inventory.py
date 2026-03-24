"""Unit tests for ansible.inventory."""

import yaml

from core.extensions import HOST_META_ONLY_KEYS
from core.inventory import (
    GroupData,
    HostData,
    read_groups,
    read_host,
    read_hosts,
    remove_group,
    remove_host,
    write_group,
    write_host,
)


def _set_host_racksmith(layout, host_id: str, data: dict) -> None:
    """Write racksmith metadata for a host.

    Targetable keys go to host_vars/{host_id}.yml with racksmith_ prefix.
    Meta-only keys go to .racksmith/.racksmith.yml hosts section.
    """
    targetable = {k: v for k, v in data.items() if k not in HOST_META_ONLY_KEYS}
    meta_only = {k: v for k, v in data.items() if k in HOST_META_ONLY_KEYS}

    if targetable:
        path = layout.host_vars_file(host_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if path.is_file():
            existing = yaml.safe_load(path.read_text()) or {}
        for k, v in targetable.items():
            existing[f"racksmith_{k}"] = v
        path.write_text(yaml.safe_dump(existing, sort_keys=False))

    if meta_only:
        meta_path = layout.racksmith_base / ".racksmith.yml"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_data: dict = {}
        if meta_path.is_file():
            meta_data = yaml.safe_load(meta_path.read_text()) or {}
        hosts_section: dict = meta_data.setdefault("hosts", {})
        host_entry: dict = hosts_section.setdefault(host_id, {})
        host_entry.update(meta_only)
        meta_path.write_text(yaml.safe_dump(meta_data, sort_keys=False))


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


class TestReadHosts:
    """read_hosts(layout) parsing."""

    def test_empty_inventory_returns_empty(self, layout) -> None:
        assert read_hosts(layout) == []

    def test_parses_hosts_from_hosts_yml(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 192.168.1.10
      ansible_user: deploy
      ansible_port: 22
    db1:
      ansible_host: 192.168.1.20
""")
        hosts = read_hosts(layout)
        assert len(hosts) == 2
        by_id = {h.id: h for h in hosts}
        assert by_id["web1"].ansible_host == "192.168.1.10"
        assert by_id["web1"].ansible_user == "deploy"
        assert by_id["web1"].ansible_port == 22
        assert by_id["db1"].ansible_host == "192.168.1.20"

    def test_merges_racksmith_meta(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        _set_host_racksmith(layout, "web1", {
            "name": "Production Web",
            "labels": ["web", "prod"],
        })
        hosts = read_hosts(layout)
        assert len(hosts) == 1
        h = hosts[0]
        assert h.racksmith["name"] == "Production Web"
        assert h.racksmith["labels"] == ["web", "prod"]

    def test_merges_meta_only_keys_from_racksmith_yml(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        _set_host_racksmith(layout, "web1", {
            "name": "Web",
            "rack": "r1",
            "position_u_start": 5,
        })
        hosts = read_hosts(layout)
        assert len(hosts) == 1
        h = hosts[0]
        assert h.racksmith["name"] == "Web"
        assert h.racksmith["rack"] == "r1"
        assert h.racksmith["position_u_start"] == 5

    def test_extracts_groups_from_children(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1: { ansible_host: 10.0.0.1 }
  children:
    web:
      hosts:
        web1: {}
    prod:
      hosts:
        web1: {}
""")
        hosts = read_hosts(layout)
        assert len(hosts) == 1
        assert set(hosts[0].groups) == {"web", "prod"}

    def test_host_with_empty_entry_in_hosts_yml_all_vars_from_host_vars(
        self, layout
    ) -> None:
        """Ansible-compliant: host has {} in hosts.yml, all vars from host_vars/."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    data1: {}
  children:
    data:
      hosts:
        data1: {}
""")
        (layout.host_vars_path / "data1.yml").write_text("""
ansible_host: 10.0.0.10
ansible_user: deploy
custom_var: from_host_vars
racksmith_name: Data Node 1
""")
        hosts = read_hosts(layout)
        assert len(hosts) == 1
        h = hosts[0]
        assert h.id == "data1"
        assert h.ansible_host == "10.0.0.10"
        assert h.ansible_user == "deploy"
        assert h.ansible_vars == {
            "custom_var": "from_host_vars",
            "racksmith_name": "Data Node 1",
        }
        assert h.racksmith["name"] == "Data Node 1"
        assert "data" in h.groups

    def test_host_defined_only_in_children_not_in_all_hosts(self, layout) -> None:
        """Ansible-compliant: host appears only in children.hosts, not in all.hosts."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    scrapers:
      hosts:
        scraper1: {}
        scraper2: {}
    shared:
      hosts:
        shared1: {}
""")
        (layout.host_vars_path / "scraper1.yml").write_text(
            "ansible_host: 10.0.0.1\nansible_user: app\n"
        )
        (layout.host_vars_path / "scraper2.yml").write_text(
            "ansible_host: 10.0.0.2\nansible_user: app\n"
        )
        (layout.host_vars_path / "shared1.yml").write_text(
            "ansible_host: 10.0.0.3\nansible_user: app\n"
        )
        hosts = read_hosts(layout)
        assert len(hosts) == 3
        by_id = {h.id: h for h in hosts}
        assert by_id["scraper1"].ansible_host == "10.0.0.1"
        assert by_id["scraper1"].groups == ["scrapers"]
        assert by_id["scraper2"].ansible_host == "10.0.0.2"
        assert by_id["shared1"].ansible_host == "10.0.0.3"
        assert by_id["shared1"].groups == ["shared"]


class TestReadHost:
    """read_host(layout, host_id) single host."""

    def test_returns_none_when_missing(self, layout) -> None:
        assert read_host(layout, "nonexistent") is None

    def test_returns_host_when_exists(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    h1: { ansible_host: 1.2.3.4 }
""")
        h = read_host(layout, "h1")
        assert h is not None
        assert h.id == "h1"
        assert h.ansible_host == "1.2.3.4"

    def test_returns_host_when_only_in_children(self, layout) -> None:
        """read_host finds host that exists only in children, not in all.hosts."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    scrapers:
      hosts:
        scraper1: {}
""")
        (layout.host_vars_path / "scraper1.yml").write_text(
            "ansible_host: 10.0.0.1\nansible_user: app\n"
        )
        h = read_host(layout, "scraper1")
        assert h is not None
        assert h.id == "scraper1"
        assert h.ansible_host == "10.0.0.1"
        assert h.groups == ["scrapers"]


class TestWriteHost:
    """write_host(layout, host) write and roundtrip."""

    def test_creates_hosts_yml_and_host_vars(self, layout) -> None:
        host = HostData(
            id="web1",
            ansible_host="192.168.1.10",
            ansible_user="deploy",
            ansible_port=22,
            ansible_vars={"ansible_python_interpreter": "auto_silent"},
            racksmith={"name": "Web 1", "labels": ["web"]},
            groups=["web"],
        )
        write_host(layout, host)
        assert (layout.inventory_path / "hosts.yml").exists()
        assert (layout.host_vars_path / "web1.yml").exists()

    def test_roundtrip_preserves_data(self, layout) -> None:
        original = HostData(
            id="db1",
            ansible_host="10.0.0.5",
            ansible_user="postgres",
            ansible_port=5432,
            ansible_vars={"foo": "bar"},
            racksmith={"name": "DB Server", "rack": "r1"},
            groups=["db", "prod"],
        )
        write_host(layout, original)
        hosts = read_hosts(layout)
        assert len(hosts) == 1
        h = hosts[0]
        assert h.id == original.id
        assert h.ansible_host == original.ansible_host
        assert h.ansible_user == original.ansible_user
        assert h.ansible_port == original.ansible_port
        assert h.ansible_vars == {
            **original.ansible_vars,
            "racksmith_name": original.racksmith["name"],
        }
        assert h.racksmith == original.racksmith
        assert set(h.groups) == set(original.groups)

    def test_preserves_existing_ansible_vars_in_host_vars(self, layout) -> None:
        """write_host preserves non-racksmith vars alongside racksmith_ prefixed keys."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    data1: {}
  children:
    data:
      hosts:
        data1: {}
""")
        (layout.host_vars_path / "data1.yml").write_text("""
ansible_host: 10.0.0.10
custom_var: from_host_vars
racksmith_name: Original Name
""")
        host = HostData(
            id="data1",
            ansible_host="10.0.0.10",
            ansible_user="deploy",
            ansible_port=22,
            ansible_vars={},
            racksmith={"name": "Updated Name"},
            groups=["data"],
        )
        write_host(layout, host)
        h = read_host(layout, "data1")
        assert h is not None
        assert h.racksmith["name"] == "Updated Name"
        assert h.ansible_vars.get("custom_var") == "from_host_vars"

    def test_no_host_vars_when_no_ansible_vars_and_no_racksmith(self, layout) -> None:
        host = HostData(id="h1", ansible_host="1.2.3.4", racksmith={})
        write_host(layout, host)
        hv_path = layout.host_vars_file("h1")
        assert not hv_path.exists()

    def test_creates_host_vars_for_racksmith_only(self, layout) -> None:
        """Host with targetable racksmith metadata but no ansible_vars still gets a file."""
        host = HostData(id="h1", ansible_host="1.2.3.4", racksmith={"name": "H1"})
        write_host(layout, host)
        hv_path = layout.host_vars_file("h1")
        assert hv_path.exists()
        content = yaml.safe_load(hv_path.read_text())
        assert content["racksmith_name"] == "H1"

    def test_meta_only_keys_go_to_racksmith_yml(self, layout) -> None:
        """Meta-only racksmith keys (rack placement) are stored in .racksmith.yml."""
        host = HostData(
            id="h1",
            ansible_host="1.2.3.4",
            racksmith={"rack": "r1", "position_u_start": 5},
        )
        write_host(layout, host)
        hv_path = layout.host_vars_file("h1")
        assert not hv_path.exists()

        meta = yaml.safe_load(
            (layout.racksmith_base / ".racksmith.yml").read_text()
        )
        assert meta["hosts"]["h1"]["rack"] == "r1"
        assert meta["hosts"]["h1"]["position_u_start"] == 5

    def test_write_host_removes_from_old_groups(self, layout) -> None:
        """When host moves from [web, db] to [web], it is removed from db."""
        host = HostData(
            id="h1",
            ansible_host="1.2.3.4",
            groups=["web", "db"],
        )
        write_host(layout, host)
        groups = read_groups(layout)
        assert len(groups) == 2
        by_id = {g.id: g for g in groups}
        assert "h1" in by_id["web"].members
        assert "h1" in by_id["db"].members

        host.groups = ["web"]
        write_host(layout, host)
        groups = read_groups(layout)
        by_id = {g.id: g for g in groups}
        assert "h1" in by_id["web"].members
        assert "h1" not in by_id["db"].members


class TestRemoveHost:
    """remove_host(layout, host_id)."""

    def test_removes_from_hosts_and_deletes_host_vars(self, layout) -> None:
        host = HostData(
            id="x1", ansible_host="1.2.3.4",
            racksmith={"name": "X", "rack": "r1"},
        )
        write_host(layout, host)
        assert len(read_hosts(layout)) == 1
        remove_host(layout, "x1")
        assert len(read_hosts(layout)) == 0
        assert not layout.host_vars_file("x1").exists()
        meta = yaml.safe_load(
            (layout.racksmith_base / ".racksmith.yml").read_text()
        )
        assert "x1" not in (meta.get("hosts") or {})


class TestReadGroups:
    """read_groups(layout)."""

    def test_empty_when_no_children(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("all:\n  hosts: {}\n")
        assert read_groups(layout) == []

    def test_parses_children(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    w1: { ansible_host: 10.0.0.1 }
    w2: { ansible_host: 10.0.0.2 }
    d1: { ansible_host: 10.0.0.3 }
  children:
    web:
      hosts:
        w1: {}
        w2: {}
    db:
      hosts:
        d1: {}
""")
        groups = read_groups(layout)
        assert len(groups) == 2
        by_id = {g.id: g for g in groups}
        assert set(by_id["web"].members) == {"w1", "w2"}
        assert set(by_id["db"].members) == {"d1"}

    def test_merges_racksmith_meta_for_groups(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    web:
      hosts: { w1: {} }
""")
        _set_group_racksmith(layout, "web", {
            "name": "Web Servers",
            "description": "All web tier hosts",
        })
        groups = read_groups(layout)
        assert len(groups) == 1
        assert groups[0].racksmith["name"] == "Web Servers"
        assert groups[0].racksmith["description"] == "All web tier hosts"

    def test_group_vars_with_ansible_vars(self, layout) -> None:
        """group_vars has both ansible vars and racksmith_ prefixed keys."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.group_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    d1: {}
    d2: {}
  children:
    data:
      hosts:
        d1: {}
        d2: {}
""")
        (layout.group_vars_path / "data.yml").write_text("""
db_port: 5432
env: production
racksmith_name: Data tier
racksmith_description: Database and ETL hosts
""")
        groups = read_groups(layout)
        assert len(groups) == 1
        g = groups[0]
        assert g.id == "data"
        assert g.ansible_vars["db_port"] == 5432
        assert g.ansible_vars["env"] == "production"
        assert g.racksmith["name"] == "Data tier"
        assert g.racksmith["description"] == "Database and ETL hosts"

    def test_group_with_no_group_vars_file(self, layout) -> None:
        """Group exists in children but has no group_vars/{id}.yml."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  children:
    bare:
      hosts: { b1: {} }
""")
        (layout.host_vars_path / "b1.yml").write_text("ansible_host: 1.2.3.4\n")
        groups = read_groups(layout)
        assert len(groups) == 1
        assert groups[0].id == "bare"
        assert groups[0].ansible_vars == {}
        assert groups[0].racksmith == {}


class TestWriteGroup:
    """write_group(layout, group)."""

    def test_creates_group_in_children(self, layout) -> None:
        group = GroupData(id="web", members=["w1", "w2"], racksmith={"name": "Web"})
        write_group(layout, group)
        groups = read_groups(layout)
        assert len(groups) == 1
        assert set(groups[0].members) == {"w1", "w2"}

    def test_writes_racksmith_to_group_vars(self, layout) -> None:
        """Racksmith metadata is stored in group_vars with racksmith_ prefix."""
        group = GroupData(
            id="prod",
            members=[],
            racksmith={"name": "Production", "description": "Prod env"},
        )
        write_group(layout, group)
        gv = yaml.safe_load(layout.group_vars_file("prod").read_text())
        assert gv["racksmith_name"] == "Production"
        assert gv["racksmith_description"] == "Prod env"

    def test_writes_group_vars_with_ansible_vars(self, layout) -> None:
        """Group vars file includes both ansible_vars and racksmith_ prefixed keys."""
        group = GroupData(
            id="data",
            members=["d1", "d2"],
            ansible_vars={"db_port": 5432, "env": "prod"},
            racksmith={"name": "Data tier", "description": "DB hosts"},
        )
        write_group(layout, group)
        gv_path = layout.group_vars_file("data")
        content = gv_path.read_text()
        assert "db_port" in content
        assert "env" in content
        assert "racksmith_name" in content

    def test_group_roundtrip_with_ansible_vars(self, layout) -> None:
        """Roundtrip preserves ansible_vars and racksmith for groups."""
        original = GroupData(
            id="shared",
            members=["s1", "s2"],
            ansible_vars={"app_port": 8080, "log_level": "info"},
            racksmith={"name": "Shared tier", "description": "Shared infra"},
        )
        write_group(layout, original)
        groups = read_groups(layout)
        assert len(groups) == 1
        g = groups[0]
        assert g.ansible_vars == original.ansible_vars
        assert g.racksmith == original.racksmith

    def test_write_group_removes_stale_members(self, layout) -> None:
        """When group members change from [a,b,c] to [a], b and c are removed."""
        group = GroupData(id="g1", members=["a", "b", "c"], racksmith={})
        write_group(layout, group)
        groups = read_groups(layout)
        assert set(groups[0].members) == {"a", "b", "c"}

        group.members = ["a"]
        write_group(layout, group)
        groups = read_groups(layout)
        assert groups[0].members == ["a"]


class TestRemoveGroup:
    """remove_group(layout, group_id)."""

    def test_removes_group_and_group_vars(self, layout) -> None:
        group = GroupData(id="g1", members=[], racksmith={"name": "G1"})
        write_group(layout, group)
        assert len(read_groups(layout)) == 1
        remove_group(layout, "g1")
        assert len(read_groups(layout)) == 0
        assert not layout.group_vars_file("g1").exists()


class TestHostAnsibleVarsRoundtrip:
    """ansible_vars survives write/read for hosts."""

    def test_vars_roundtrip(self, layout) -> None:
        original = HostData(
            id="h1",
            ansible_host="10.0.0.1",
            ansible_user="deploy",
            ansible_port=22,
            ansible_vars={"http_port": 8080, "debug": True, "name": "hello"},
            racksmith={"name": "H1"},
            groups=[],
        )
        write_host(layout, original)
        h = read_host(layout, "h1")
        assert h is not None
        assert h.ansible_vars == {
            "http_port": 8080,
            "debug": True,
            "name": "hello",
            "racksmith_name": "H1",
        }

    def test_empty_vars_roundtrip(self, layout) -> None:
        original = HostData(
            id="h2",
            ansible_host="10.0.0.2",
            ansible_vars={},
            racksmith={"name": "H2"},
            groups=[],
        )
        write_host(layout, original)
        h = read_host(layout, "h2")
        assert h is not None
        assert h.ansible_vars == {"racksmith_name": "H2"}

    def test_inventory_connection_vars_excluded_racksmith_mirrored(self, layout) -> None:
        """ansible_host/user/port stay top-level; racksmith_* also mirrored in ansible_vars."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    x1: {}
""")
        (layout.host_vars_path / "x1.yml").write_text("""
ansible_host: 10.0.0.1
ansible_user: admin
ansible_port: 2222
racksmith_name: Node X
custom_key: hello
""")
        h = read_host(layout, "x1")
        assert h is not None
        assert h.ansible_host == "10.0.0.1"
        assert h.ansible_user == "admin"
        assert h.ansible_port == 2222
        assert h.racksmith["name"] == "Node X"
        assert h.ansible_vars == {"custom_key": "hello", "racksmith_name": "Node X"}

    def test_user_vars_not_in_hosts_yml(self, layout) -> None:
        """User-defined vars should only appear in host_vars/, not hosts.yml."""
        original = HostData(
            id="h3",
            ansible_host="10.0.0.3",
            ansible_user="deploy",
            ansible_port=22,
            ansible_vars={"http_port": 8080, "debug": True},
            racksmith={"name": "H3"},
            groups=[],
        )
        write_host(layout, original)

        inv = yaml.safe_load(
            (layout.inventory_path / "hosts.yml").read_text(encoding="utf-8")
        )
        inv_entry = inv["all"]["hosts"]["h3"]
        assert "http_port" not in inv_entry
        assert "debug" not in inv_entry
        assert inv_entry["ansible_host"] == "10.0.0.3"

        hv = yaml.safe_load(
            layout.host_vars_file("h3").read_text(encoding="utf-8")
        )
        assert hv["http_port"] == 8080
        assert hv["debug"] is True


class TestRuamelPreservesFormatting:
    """Verify ruamel.yaml preserves comments/formatting on modify."""

    def test_roundtrip_preserves_structure(self, layout) -> None:
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        original = """all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      # keep this comment
"""
        (layout.inventory_path / "hosts.yml").write_text(original)
        host = read_host(layout, "web1")
        assert host is not None
        host.ansible_user = "deploy"
        write_host(layout, host)
        written = (layout.inventory_path / "hosts.yml").read_text()
        assert "ansible_host" in written
        assert "ansible_user" in written

    def test_roundtrip_preserves_comments(self, layout) -> None:
        """YAML comments survive write_host round-trip."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      # Production web server
""")
        host = read_host(layout, "web1")
        assert host is not None
        host.ansible_user = "deploy"
        write_host(layout, host)
        written = (layout.inventory_path / "hosts.yml").read_text()
        assert (
            "# Production web server" in written or "Production web server" in written
        )
