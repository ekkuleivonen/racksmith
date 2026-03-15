"""Tests for v002: rename role input hint ``interactive`` → ``secret``."""

from __future__ import annotations

from pathlib import Path

import yaml

from core.config import AnsibleLayout
from core.repo_migrations.v002_rename_interactive_to_secret import Migration


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _racksmith_yml(layout: AnsibleLayout) -> Path:
    return layout.racksmith_base / ".racksmith.yml"


def _meta_with_interactive() -> dict:
    return {
        "schema_version": 1,
        "roles": {
            "role_abc": {
                "inputs": {
                    "db_password": {"placeholder": "enter pw", "interactive": True},
                    "db_host": {"placeholder": "hostname"},
                },
            },
            "role_xyz": {
                "inputs": {
                    "api_key": {"interactive": True},
                },
            },
        },
    }


class TestUp:
    def test_renames_interactive_to_secret(self, layout: AnsibleLayout) -> None:
        _dump(_racksmith_yml(layout), _meta_with_interactive())

        Migration().run_up(layout)

        data = _load(_racksmith_yml(layout))
        db_pw = data["roles"]["role_abc"]["inputs"]["db_password"]
        assert "interactive" not in db_pw
        assert db_pw["secret"] is True

        api_key = data["roles"]["role_xyz"]["inputs"]["api_key"]
        assert "interactive" not in api_key
        assert api_key["secret"] is True

    def test_preserves_other_keys(self, layout: AnsibleLayout) -> None:
        _dump(_racksmith_yml(layout), _meta_with_interactive())

        Migration().run_up(layout)

        data = _load(_racksmith_yml(layout))
        db_pw = data["roles"]["role_abc"]["inputs"]["db_password"]
        assert db_pw["placeholder"] == "enter pw"

        db_host = data["roles"]["role_abc"]["inputs"]["db_host"]
        assert db_host == {"placeholder": "hostname"}

    def test_preserves_top_level_keys(self, layout: AnsibleLayout) -> None:
        _dump(_racksmith_yml(layout), _meta_with_interactive())

        Migration().run_up(layout)

        data = _load(_racksmith_yml(layout))
        assert data["schema_version"] == 1

    def test_no_roles_is_noop(self, layout: AnsibleLayout) -> None:
        original = {"schema_version": 1}
        _dump(_racksmith_yml(layout), original)

        Migration().run_up(layout)

        assert _load(_racksmith_yml(layout)) == original

    def test_role_without_inputs_is_noop(self, layout: AnsibleLayout) -> None:
        original = {"schema_version": 1, "roles": {"r1": {"registry_id": "foo"}}}
        _dump(_racksmith_yml(layout), original)

        Migration().run_up(layout)

        assert _load(_racksmith_yml(layout)) == original

    def test_idempotent(self, layout: AnsibleLayout) -> None:
        _dump(_racksmith_yml(layout), _meta_with_interactive())
        m = Migration()

        m.run_up(layout)
        first = _load(_racksmith_yml(layout))
        m.run_up(layout)
        second = _load(_racksmith_yml(layout))

        assert first == second


class TestDown:
    def test_renames_secret_back_to_interactive(self, layout: AnsibleLayout) -> None:
        _dump(_racksmith_yml(layout), _meta_with_interactive())
        m = Migration()
        m.run_up(layout)
        m.run_down(layout)

        data = _load(_racksmith_yml(layout))
        db_pw = data["roles"]["role_abc"]["inputs"]["db_password"]
        assert "secret" not in db_pw
        assert db_pw["interactive"] is True

    def test_roundtrip_preserves_data(self, layout: AnsibleLayout) -> None:
        original = _meta_with_interactive()
        _dump(_racksmith_yml(layout), original)

        m = Migration()
        m.run_up(layout)
        m.run_down(layout)

        assert _load(_racksmith_yml(layout)) == original

    def test_down_on_clean_repo_is_noop(self, layout: AnsibleLayout) -> None:
        original = {"schema_version": 1, "roles": {"r1": {"inputs": {"x": {"placeholder": "hi"}}}}}
        _dump(_racksmith_yml(layout), original)

        Migration().run_down(layout)

        assert _load(_racksmith_yml(layout)) == original
