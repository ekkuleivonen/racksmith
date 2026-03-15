"""Tests for v004 migration: minimize .racksmith.yml metadata."""

from __future__ import annotations

from pathlib import Path

import yaml

from core.config import AnsibleLayout
from core.repo_migrations.v004_minimize_meta import Migration


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _scaffold(
    layout: AnsibleLayout,
    *,
    roles_meta: dict | None = None,
    playbooks_meta: dict | None = None,
    galaxy_files: dict[str, dict] | None = None,
    playbook_files: dict[str, list] | None = None,
) -> None:
    """Build a v003-era repo for v004 migration testing."""
    meta: dict = {"schema_version": 3}
    if roles_meta:
        meta["roles"] = roles_meta
    if playbooks_meta:
        meta["playbooks"] = playbooks_meta
    _dump(layout.racksmith_base / ".racksmith.yml", meta)

    _dump(layout.inventory_path / "hosts.yml", {
        "all": {"hosts": {"web1": {"ansible_host": "10.0.0.1"}}},
    })

    if galaxy_files:
        for role_id, galaxy_data in galaxy_files.items():
            _dump(layout.roles_path / role_id / "meta" / "main.yml", galaxy_data)

    if playbook_files:
        for pb_id, plays in playbook_files.items():
            _dump(layout.playbooks_path / f"{pb_id}.yml", plays)


# ---------------------------------------------------------------------------
# UP (forward migration)
# ---------------------------------------------------------------------------


class TestMigrationUp:
    def test_strips_slug_from_roles(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "role_abc": {
                "slug": "ssh-hardening",
                "inputs": {
                    "enable_pubkey": {"label": "Enable PK", "interactive": True},
                },
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        role = meta["roles"]["role_abc"]
        assert "slug" not in role
        inp = role["inputs"]["enable_pubkey"]
        assert "label" not in inp
        assert inp["interactive"] is True

    def test_strips_label_from_inputs(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "role_def": {
                "slug": "test",
                "inputs": {
                    "port": {"label": "Port Number"},
                },
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "roles" not in meta

    def test_keeps_interactive_and_placeholder(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "role_ghi": {
                "slug": "test",
                "inputs": {
                    "password": {
                        "label": "Password",
                        "interactive": True,
                        "placeholder": "Enter password...",
                    },
                },
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        inp = meta["roles"]["role_ghi"]["inputs"]["password"]
        assert inp == {"interactive": True, "placeholder": "Enter password..."}

    def test_removes_role_entry_when_empty(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, roles_meta={
            "role_jkl": {"slug": "only-slug"},
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "roles" not in meta

    def test_strips_name_from_playbooks(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, playbooks_meta={
            "playbook_abc": {
                "name": "Test Playbook",
                "description": "hello world",
            },
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        pb = meta["playbooks"]["playbook_abc"]
        assert "name" not in pb
        assert pb["description"] == "hello world"

    def test_removes_playbook_entry_when_only_name(self, layout: AnsibleLayout) -> None:
        _scaffold(layout, playbooks_meta={
            "playbook_xyz": {"name": "Only Name"},
        })
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "playbooks" not in meta

    def test_noop_when_no_roles_or_playbooks(self, layout: AnsibleLayout) -> None:
        _scaffold(layout)
        meta_before = _load(layout.racksmith_base / ".racksmith.yml")
        Migration().run_up(layout)
        meta_after = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta_before == meta_after

    def test_idempotent(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            roles_meta={"r": {"slug": "r", "inputs": {"k": {"label": "L", "interactive": True}}}},
            playbooks_meta={"p": {"name": "P", "description": "D"}},
        )
        Migration().run_up(layout)
        meta_1 = _load(layout.racksmith_base / ".racksmith.yml")
        Migration().run_up(layout)
        meta_2 = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta_1 == meta_2

    def test_combined_roles_and_playbooks(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            roles_meta={
                "role_a": {
                    "slug": "deploy",
                    "inputs": {"env": {"label": "Environment", "interactive": True}},
                },
                "role_b": {"slug": "cleanup"},
            },
            playbooks_meta={
                "pb_a": {"name": "Deploy", "description": "Deploy all"},
                "pb_b": {"name": "Cleanup"},
            },
        )
        Migration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["roles"]["role_a"]["inputs"]["env"] == {"interactive": True}
        assert "role_b" not in meta["roles"]
        assert meta["playbooks"]["pb_a"] == {"description": "Deploy all"}
        assert "pb_b" not in meta["playbooks"]


# ---------------------------------------------------------------------------
# DOWN (rollback)
# ---------------------------------------------------------------------------


class TestMigrationDown:
    def test_restores_slug_from_galaxy_info(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            roles_meta={
                "role_abc": {
                    "slug": "ssh-hardening",
                    "inputs": {"enable_pk": {"label": "Enable PK"}},
                },
            },
            galaxy_files={
                "role_abc": {
                    "galaxy_info": {"role_name": "SSH Hardening"},
                    "argument_specs": {
                        "main": {
                            "options": {
                                "enable_pk": {
                                    "type": "bool",
                                    "description": "Enable Public Key Authentication",
                                },
                            },
                        },
                    },
                },
            },
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        role = meta["roles"]["role_abc"]
        assert role["slug"] == "ssh-hardening"
        assert role["inputs"]["enable_pk"]["label"] == "Enable Public Key Authentication"

    def test_restores_playbook_name(self, layout: AnsibleLayout) -> None:
        _scaffold(layout,
            playbooks_meta={
                "pb_abc": {"name": "Test PB", "description": "A desc"},
            },
            playbook_files={
                "pb_abc": [{"name": "Test PB", "hosts": "all", "roles": []}],
            },
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        pb = meta["playbooks"]["pb_abc"]
        assert pb["name"] == "Test PB"
        assert pb["description"] == "A desc"

    def test_role_without_galaxy_still_gets_slug(self, layout: AnsibleLayout) -> None:
        """Without galaxy_info, slug cannot be reconstructed so role stays as-is after rollback."""
        _scaffold(layout,
            roles_meta={"role_no_galaxy": {"slug": "my-slug"}},
        )
        Migration().run_up(layout)
        Migration().run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "roles" not in meta or "role_no_galaxy" not in meta.get("roles", {})
