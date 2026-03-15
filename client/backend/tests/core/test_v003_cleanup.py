"""Tests for v003 migration: drop host notes, deduplicate role metadata."""

from __future__ import annotations

from pathlib import Path

import yaml

from core.config import AnsibleLayout
from core.repo_migrations.v003_cleanup import Migration


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _scaffold(
    layout: AnsibleLayout,
    *,
    hosts: dict | None = None,
    roles_meta: dict | None = None,
    galaxy_files: dict[str, dict] | None = None,
) -> None:
    """Build a v002-era repo for v003 migration testing."""
    meta: dict = {"schema_version": 2}
    if hosts:
        meta["hosts"] = hosts
    if roles_meta:
        meta["roles"] = roles_meta
    _dump(layout.racksmith_base / ".racksmith.yml", meta)

    _dump(layout.inventory_path / "hosts.yml", {
        "all": {"hosts": {"web1": {"ansible_host": "10.0.0.1"}}},
    })

    if galaxy_files:
        for role_id, galaxy_info in galaxy_files.items():
            role_meta = {"galaxy_info": galaxy_info}
            _dump(layout.roles_path / role_id / "meta" / "main.yml", role_meta)


# ---------------------------------------------------------------------------
# UP (forward migration)
# ---------------------------------------------------------------------------


class TestMigrationUp:

    def test_drops_notes_from_hosts(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, hosts={
            "web1": {"rack": "r1", "notes": "Some note"},
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["rack"] == "r1"
        assert "notes" not in meta["hosts"]["web1"]

    def test_removes_host_entry_when_only_notes(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, hosts={
            "web1": {"notes": "Only notes"},
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "hosts" not in meta

    def test_strips_duplicated_role_keys(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "myrole": {
                "slug": "myrole",
                "name": "My Role",
                "description": "A role",
                "labels": ["web"],
                "compatibility": {"os_family": ["debian"]},
                "inputs": {"port": {"label": "Port Number", "interactive": True}},
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        role = meta["roles"]["myrole"]
        assert role["slug"] == "myrole"
        assert "name" not in role
        assert "description" not in role
        assert "labels" not in role
        assert "compatibility" not in role
        assert role["inputs"]["port"]["label"] == "Port Number"
        assert role["inputs"]["port"]["interactive"] is True

    def test_removes_role_entry_when_only_duplicated_keys(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "simple": {
                "name": "Simple",
                "description": "No inputs",
                "labels": [],
                "compatibility": {},
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "roles" not in meta

    def test_noop_when_no_hosts_or_roles(self, layout: AnsibleLayout) -> None:
        _scaffold(layout)
        meta_before = _load(layout.racksmith_base / ".racksmith.yml")
        Migration().run_up(layout)
        meta_after = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta_before == meta_after

    def test_keeps_slug_in_roles(self, layout: AnsibleLayout) -> None:
        """Slug is Racksmith-specific and stays in .racksmith.yml."""
        _scaffold(layout, roles_meta={
            "myrole": {
                "slug": "my-custom-slug",
                "name": "My Role",
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["roles"]["myrole"]["slug"] == "my-custom-slug"
        assert "name" not in meta["roles"]["myrole"]

    def test_idempotent(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            hosts={"web1": {"rack": "r1", "notes": "N"}},
            roles_meta={"r": {"slug": "r", "name": "R", "inputs": {"k": {"label": "L"}}}},
        )
        Migration().run_up(layout)
        meta_1 = _load(layout.racksmith_base / ".racksmith.yml")
        Migration().run_up(layout)
        meta_2 = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta_1 == meta_2

    def test_combined_hosts_and_roles(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            hosts={
                "web1": {"rack": "r1", "notes": "drop me"},
                "db1": {"notes": "also drop"},
            },
            roles_meta={
                "deploy": {
                    "slug": "deploy",
                    "name": "Deploy",
                    "inputs": {"env": {"label": "Environment"}},
                },
                "cleanup": {
                    "name": "Cleanup",
                },
            },
        )
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"] == {"rack": "r1"}
        assert "db1" not in meta["hosts"]
        assert meta["roles"]["deploy"]["slug"] == "deploy"
        assert meta["roles"]["deploy"]["inputs"]["env"]["label"] == "Environment"
        assert "cleanup" not in meta["roles"]


# ---------------------------------------------------------------------------
# DOWN (rollback)
# ---------------------------------------------------------------------------


class TestMigrationDown:

    def test_restores_role_duplicated_keys(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            roles_meta={
                "myrole": {
                    "slug": "myrole",
                    "name": "My Role",
                    "description": "A role",
                    "labels": ["web"],
                    "compatibility": {"os_family": ["debian"]},
                    "inputs": {"port": {"label": "Port"}},
                },
            },
            galaxy_files={
                "myrole": {
                    "role_name": "My Role",
                    "description": "A role",
                    "galaxy_tags": ["web"],
                    "platforms": [{"name": "debian"}],
                },
            },
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        role = meta["roles"]["myrole"]
        assert role["slug"] == "myrole"
        assert role["name"] == "My Role"
        assert role["description"] == "A role"
        assert role["labels"] == ["web"]
        assert role["compatibility"] == {"os_family": ["debian"]}
        assert role["inputs"]["port"]["label"] == "Port"

    def test_notes_not_restored(self, layout: AnsibleLayout) -> None:
        """Notes are intentionally dropped and not recovered on rollback."""
        _scaffold(layout, hosts={
            "web1": {"rack": "r1", "notes": "Gone forever"},
        })
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"] == {"rack": "r1"}
        assert "notes" not in meta["hosts"]["web1"]

    def test_role_with_no_galaxy_file_keeps_slug_only(
        self, layout: AnsibleLayout,
    ) -> None:
        """Without a galaxy file, only slug + inputs survive the roundtrip."""
        _scaffold(layout,
            roles_meta={
                "norole": {
                    "slug": "norole",
                    "name": "No Role",
                    "inputs": {"x": {"label": "X"}},
                },
            },
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["roles"]["norole"]["slug"] == "norole"
        assert meta["roles"]["norole"]["inputs"]["x"]["label"] == "X"
        assert "name" not in meta["roles"]["norole"]
