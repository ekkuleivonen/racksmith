"""Tests for v002 migration: move targetable host/group vars to Ansible-native files."""

from __future__ import annotations

from pathlib import Path

import yaml

from core.config import AnsibleLayout
from core.repo_migrations.v002_vars_to_native import Migration


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _scaffold(
    layout: AnsibleLayout,
    *,
    host_meta: dict | None = None,
    group_meta: dict | None = None,
    host_vars: dict[str, dict] | None = None,
    group_vars: dict[str, dict] | None = None,
) -> None:
    """Build a repo with old-style .racksmith.yml hosts/groups sections."""
    meta: dict = {"schema_version": 2}
    if host_meta:
        meta["hosts"] = host_meta
    if group_meta:
        meta["groups"] = group_meta
    _dump(layout.racksmith_base / ".racksmith.yml", meta)

    _dump(layout.inventory_path / "hosts.yml", {
        "all": {"hosts": {"web1": {"ansible_host": "10.0.0.1"}}},
    })

    if host_vars:
        for host_id, vars_ in host_vars.items():
            _dump(layout.host_vars_file(host_id), vars_)

    if group_vars:
        for group_id, vars_ in group_vars.items():
            _dump(layout.group_vars_file(group_id), vars_)


# ---------------------------------------------------------------------------
# UP (forward migration)
# ---------------------------------------------------------------------------


class TestMigrationUp:

    def test_moves_targetable_host_meta_to_host_vars(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web Server", "managed": True}},
            host_vars={"web1": {"http_port": 80}},
        )
        Migration().run_up(layout)

        hv = _load(layout.host_vars_file("web1"))
        assert hv["racksmith_name"] == "Web Server"
        assert hv["racksmith_managed"] is True
        assert hv["http_port"] == 80

    def test_keeps_meta_only_keys_in_racksmith_yml(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {
                "name": "Web",
                "rack": "r1",
                "position_u_start": 5,
                "position_u_height": 2,
            }},
        )
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["rack"] == "r1"
        assert meta["hosts"]["web1"]["position_u_start"] == 5
        assert meta["hosts"]["web1"]["position_u_height"] == 2
        assert "name" not in meta["hosts"]["web1"]

        hv = _load(layout.host_vars_file("web1"))
        assert hv["racksmith_name"] == "Web"
        assert "racksmith_rack" not in hv
        assert "racksmith_position_u_start" not in hv

    def test_moves_group_meta_to_group_vars(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            group_meta={"web": {"name": "Web Servers", "description": "HTTP tier"}},
            group_vars={"web": {"http_port": 8080}},
        )
        Migration().run_up(layout)

        gv = _load(layout.group_vars_file("web"))
        assert gv["racksmith_name"] == "Web Servers"
        assert gv["racksmith_description"] == "HTTP tier"
        assert gv["http_port"] == 8080

    def test_removes_hosts_section_when_only_targetable_keys(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "W"}},
            group_meta={"g1": {"name": "G"}},
        )
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "hosts" not in meta
        assert "groups" not in meta
        assert meta["schema_version"] == 2

    def test_creates_host_vars_file_when_none_exists(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web", "labels": ["prod"]}},
        )
        assert not layout.host_vars_file("web1").is_file()

        Migration().run_up(layout)

        hv = _load(layout.host_vars_file("web1"))
        assert hv["racksmith_name"] == "Web"
        assert hv["racksmith_labels"] == ["prod"]

    def test_creates_group_vars_file_when_none_exists(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            group_meta={"db": {"name": "Database", "description": "DB tier"}},
        )
        assert not layout.group_vars_file("db").is_file()

        Migration().run_up(layout)

        gv = _load(layout.group_vars_file("db"))
        assert gv["racksmith_name"] == "Database"

    def test_no_hosts_or_groups_is_noop(self, layout: AnsibleLayout) -> None:
        _scaffold(layout)
        meta_before = _load(layout.racksmith_base / ".racksmith.yml")
        Migration().run_up(layout)
        meta_after = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta_before == meta_after

    def test_splits_mixed_keys_correctly(self, layout: AnsibleLayout) -> None:
        """Host with both targetable and meta-only keys."""
        _scaffold(layout,
            host_meta={"web1": {
                "labels": ["web", "prod"],
                "rack": "r1",
                "position_u_start": 5,
                "position_u_height": 2,
                "position_col_start": 0,
                "position_col_count": 1,
            }},
        )
        Migration().run_up(layout)

        hv = _load(layout.host_vars_file("web1"))
        assert hv["racksmith_labels"] == ["web", "prod"]
        assert "racksmith_rack" not in hv
        assert "racksmith_position_u_start" not in hv

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["rack"] == "r1"
        assert meta["hosts"]["web1"]["position_u_start"] == 5
        assert meta["hosts"]["web1"]["position_u_height"] == 2
        assert meta["hosts"]["web1"]["position_col_start"] == 0
        assert meta["hosts"]["web1"]["position_col_count"] == 1

    def test_no_host_vars_file_for_meta_only_host(self, layout: AnsibleLayout) -> None:
        """Host with only meta-only keys should not get a host_vars file."""
        _scaffold(layout,
            host_meta={"web1": {"rack": "r1", "position_u_start": 5}},
        )
        Migration().run_up(layout)

        assert not layout.host_vars_file("web1").is_file()

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["rack"] == "r1"
        assert meta["hosts"]["web1"]["position_u_start"] == 5

    def test_multiple_hosts_and_groups(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={
                "web1": {"name": "Web 1"},
                "db1": {"name": "DB 1"},
            },
            group_meta={
                "web": {"name": "Web"},
                "db": {"name": "DB"},
            },
        )
        Migration().run_up(layout)

        assert _load(layout.host_vars_file("web1"))["racksmith_name"] == "Web 1"
        assert _load(layout.host_vars_file("db1"))["racksmith_name"] == "DB 1"
        assert _load(layout.group_vars_file("web"))["racksmith_name"] == "Web"
        assert _load(layout.group_vars_file("db"))["racksmith_name"] == "DB"

    def test_idempotent(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web", "rack": "r1"}},
            host_vars={"web1": {"http_port": 80}},
        )
        Migration().run_up(layout)
        Migration().run_up(layout)

        hv = _load(layout.host_vars_file("web1"))
        assert hv["racksmith_name"] == "Web"
        assert hv["http_port"] == 80
        assert "racksmith_rack" not in hv

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["rack"] == "r1"


# ---------------------------------------------------------------------------
# DOWN (rollback)
# ---------------------------------------------------------------------------


class TestMigrationDown:

    def test_restores_host_meta_to_racksmith_yml(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web", "managed": True}},
            host_vars={"web1": {"http_port": 80}},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["name"] == "Web"
        assert meta["hosts"]["web1"]["managed"] is True

    def test_restores_mixed_keys_to_racksmith_yml(self, layout: AnsibleLayout) -> None:
        """Rollback merges targetable keys from host_vars back with meta-only keys."""
        _scaffold(layout,
            host_meta={"web1": {
                "name": "Web",
                "rack": "r1",
                "position_u_start": 5,
            }},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["name"] == "Web"
        assert meta["hosts"]["web1"]["rack"] == "r1"
        assert meta["hosts"]["web1"]["position_u_start"] == 5

    def test_restores_group_meta_to_racksmith_yml(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            group_meta={"web": {"name": "Web Servers"}},
            group_vars={"web": {"http_port": 8080}},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["groups"]["web"]["name"] == "Web Servers"

    def test_strips_racksmith_prefix_from_host_vars(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web"}},
            host_vars={"web1": {"http_port": 80}},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        hv = _load(layout.host_vars_file("web1"))
        assert "racksmith_name" not in hv
        assert hv["http_port"] == 80

    def test_strips_racksmith_prefix_from_group_vars(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            group_meta={"web": {"name": "W"}},
            group_vars={"web": {"http_port": 8080}},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        gv = _load(layout.group_vars_file("web"))
        assert "racksmith_name" not in gv
        assert gv["http_port"] == 8080

    def test_removes_host_vars_file_if_only_racksmith_keys(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web"}},
        )
        Migration().run_up(layout)
        assert layout.host_vars_file("web1").is_file()

        Migration().run_down(layout)
        assert not layout.host_vars_file("web1").is_file()

    def test_roundtrip_preserves_all_data(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            host_meta={"web1": {"name": "Web", "labels": ["prod"], "rack": "r1", "position_u_start": 3}},
            group_meta={"g1": {"name": "Group 1", "description": "Desc"}},
            host_vars={"web1": {"http_port": 80}},
            group_vars={"g1": {"db_port": 5432}},
        )
        meta_before = _load(layout.racksmith_base / ".racksmith.yml")
        hv_before = _load(layout.host_vars_file("web1"))
        gv_before = _load(layout.group_vars_file("g1"))

        Migration().run_up(layout)
        Migration().run_down(layout)

        assert _load(layout.racksmith_base / ".racksmith.yml") == meta_before
        assert _load(layout.host_vars_file("web1")) == hv_before
        assert _load(layout.group_vars_file("g1")) == gv_before
