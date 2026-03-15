"""Tests for RepoMigration base class and hook dispatch."""

from __future__ import annotations

from pathlib import Path

import yaml

from core.config import AnsibleLayout
from core.repo_migrations._base import RepoMigration

# ---------------------------------------------------------------------------
# Example subclass used by tests
# ---------------------------------------------------------------------------


class AddMonitoringMigration(RepoMigration):
    """Example: add ``monitoring_enabled: true`` to every host_vars file
    and a ``monitoring`` section to .racksmith.yml hosts metadata."""

    def up_host_vars(self, host_id: str, data: dict) -> dict:
        data.setdefault("monitoring_enabled", True)
        return data

    def down_host_vars(self, host_id: str, data: dict) -> dict:
        data.pop("monitoring_enabled", None)
        return data

    def up_racksmith_meta(self, data: dict) -> dict:
        for host_meta in (data.get("hosts") or {}).values():
            host_meta.setdefault("monitoring", {"enabled": True})
        return data

    def down_racksmith_meta(self, data: dict) -> dict:
        for host_meta in (data.get("hosts") or {}).values():
            host_meta.pop("monitoring", None)
        return data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _scaffold_repo(layout: AnsibleLayout) -> None:
    """Create a minimal repo with one host, one group, one playbook, one role."""
    _dump(layout.racksmith_base / ".racksmith.yml", {
        "schema_version": 4,
        "hosts": {"web1": {"display_name": "Web 1"}},
    })
    _dump(layout.inventory_path / "hosts.yml", {
        "all": {"hosts": {"web1": {"ansible_host": "10.0.0.1"}}},
    })
    _dump(layout.host_vars_path / "web1.yml", {"http_port": 80})
    _dump(layout.group_vars_path / "webservers.yml", {"http_port": 8080})
    _dump(layout.playbooks_path / "deploy.yml", [
        {"name": "Deploy", "hosts": "all", "roles": []},
    ])

    role_dir = layout.roles_path / "myrole"
    _dump(role_dir / "meta" / "main.yml", {
        "galaxy_info": {"role_name": "myrole"},
    })
    _dump(role_dir / "defaults" / "main.yml", {"some_default": 42})
    _dump(role_dir / "tasks" / "main.yml", [
        {"name": "ping", "ansible.builtin.ping": None},
    ])


# ---------------------------------------------------------------------------
# Tests — base class (no-op)
# ---------------------------------------------------------------------------


class TestBaseNoOp:
    """Running the base class directly should leave every file untouched."""

    def test_run_up_no_changes(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        stamps = {
            p: p.stat().st_mtime_ns
            for p in layout.racksmith_base.rglob("*.yml")
        }

        RepoMigration().run_up(layout)

        for path, mtime in stamps.items():
            assert path.stat().st_mtime_ns == mtime, f"{path} was rewritten"

    def test_run_down_no_changes(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        stamps = {
            p: p.stat().st_mtime_ns
            for p in layout.racksmith_base.rglob("*.yml")
        }

        RepoMigration().run_down(layout)

        for path, mtime in stamps.items():
            assert path.stat().st_mtime_ns == mtime, f"{path} was rewritten"

    def test_empty_repo_no_error(self, layout: AnsibleLayout) -> None:
        """No files at all — run_up/run_down should not crash."""
        RepoMigration().run_up(layout)
        RepoMigration().run_down(layout)


# ---------------------------------------------------------------------------
# Tests — example subclass up
# ---------------------------------------------------------------------------


class TestAddMonitoringUp:

    def test_adds_monitoring_to_host_vars(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        AddMonitoringMigration().run_up(layout)

        result = _load(layout.host_vars_path / "web1.yml")
        assert result["monitoring_enabled"] is True
        assert result["http_port"] == 80

    def test_adds_monitoring_to_racksmith_meta(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        AddMonitoringMigration().run_up(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert meta["hosts"]["web1"]["monitoring"] == {"enabled": True}
        assert meta["hosts"]["web1"]["display_name"] == "Web 1"

    def test_does_not_touch_unrelated_files(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        hosts_yml = layout.inventory_path / "hosts.yml"
        group_yml = layout.group_vars_path / "webservers.yml"
        playbook_yml = layout.playbooks_path / "deploy.yml"

        stamps = {
            p: p.stat().st_mtime_ns for p in [hosts_yml, group_yml, playbook_yml]
        }

        AddMonitoringMigration().run_up(layout)

        for path, mtime in stamps.items():
            assert path.stat().st_mtime_ns == mtime, f"{path} was rewritten"

    def test_idempotent(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        m = AddMonitoringMigration()
        m.run_up(layout)
        m.run_up(layout)

        result = _load(layout.host_vars_path / "web1.yml")
        assert result["monitoring_enabled"] is True

    def test_multiple_hosts(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        _dump(layout.host_vars_path / "db1.yml", {"pg_version": 16})

        AddMonitoringMigration().run_up(layout)

        assert _load(layout.host_vars_path / "web1.yml")["monitoring_enabled"] is True
        assert _load(layout.host_vars_path / "db1.yml")["monitoring_enabled"] is True


# ---------------------------------------------------------------------------
# Tests — example subclass down (rollback)
# ---------------------------------------------------------------------------


class TestAddMonitoringDown:

    def test_removes_monitoring_from_host_vars(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        m = AddMonitoringMigration()
        m.run_up(layout)
        m.run_down(layout)

        result = _load(layout.host_vars_path / "web1.yml")
        assert "monitoring_enabled" not in result
        assert result["http_port"] == 80

    def test_removes_monitoring_from_racksmith_meta(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        m = AddMonitoringMigration()
        m.run_up(layout)
        m.run_down(layout)

        meta = _load(layout.racksmith_base / ".racksmith.yml")
        assert "monitoring" not in meta["hosts"]["web1"]
        assert meta["hosts"]["web1"]["display_name"] == "Web 1"

    def test_roundtrip_preserves_original_data(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        before = _load(layout.host_vars_path / "web1.yml")

        m = AddMonitoringMigration()
        m.run_up(layout)
        m.run_down(layout)

        after = _load(layout.host_vars_path / "web1.yml")
        assert after == before

    def test_down_on_clean_repo_is_noop(self, layout: AnsibleLayout) -> None:
        """Running down without a prior up should not break anything."""
        _scaffold_repo(layout)
        before = _load(layout.host_vars_path / "web1.yml")

        AddMonitoringMigration().run_down(layout)

        after = _load(layout.host_vars_path / "web1.yml")
        assert after == before


# ---------------------------------------------------------------------------
# Tests — hook dispatch coverage
# ---------------------------------------------------------------------------


class _HookTracker(RepoMigration):
    """Records which hooks were called and with what IDs."""

    def __init__(self):
        self.calls: list[tuple[str, str | None]] = []

    def _record(self, name: str, entity_id: str | None, data):
        self.calls.append((name, entity_id))
        return data

    def up_prepare(self, layout):
        self.calls.append(("prepare", None))

    def up_racksmith_meta(self, data):
        return self._record("racksmith_meta", None, data)

    def up_hosts_yml(self, data):
        return self._record("hosts_yml", None, data)

    def up_host_vars(self, host_id, data):
        return self._record("host_vars", host_id, data)

    def up_group_vars(self, group_id, data):
        return self._record("group_vars", group_id, data)

    def up_playbook(self, playbook_id, data):
        return self._record("playbook", playbook_id, data)

    def up_role_meta(self, role_id, data):
        return self._record("role_meta", role_id, data)

    def up_role_defaults(self, role_id, data):
        return self._record("role_defaults", role_id, data)

    def up_role_tasks(self, role_id, data):
        return self._record("role_tasks", role_id, data)


class TestHookDispatch:

    def test_all_hooks_called(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        tracker = _HookTracker()
        tracker.run_up(layout)

        names = [name for name, _ in tracker.calls]
        assert "prepare" in names
        assert "racksmith_meta" in names
        assert "hosts_yml" in names
        assert "host_vars" in names
        assert "group_vars" in names
        assert "playbook" in names
        assert "role_meta" in names
        assert "role_defaults" in names
        assert "role_tasks" in names

    def test_prepare_runs_before_file_hooks(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        tracker = _HookTracker()
        tracker.run_up(layout)
        assert tracker.calls[0] == ("prepare", None)

    def test_host_vars_called_per_host(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        _dump(layout.host_vars_path / "db1.yml", {"pg_version": 16})

        tracker = _HookTracker()
        tracker.run_up(layout)

        hv_ids = [eid for name, eid in tracker.calls if name == "host_vars" and eid is not None]
        assert sorted(hv_ids) == ["db1", "web1"]

    def test_roles_called_per_role(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        role2 = layout.roles_path / "another"
        _dump(role2 / "meta" / "main.yml", {"galaxy_info": {}})
        _dump(role2 / "tasks" / "main.yml", [])

        tracker = _HookTracker()
        tracker.run_up(layout)

        role_meta_ids = [eid for name, eid in tracker.calls if name == "role_meta" and eid is not None]
        assert sorted(role_meta_ids) == ["another", "myrole"]

    def test_missing_dirs_skipped(self, layout: AnsibleLayout) -> None:
        """Only .racksmith.yml exists — no crash, only that hook fires."""
        _dump(layout.racksmith_base / ".racksmith.yml", {"schema_version": 4})

        tracker = _HookTracker()
        tracker.run_up(layout)

        names = [name for name, _ in tracker.calls]
        assert names == ["prepare", "racksmith_meta"]


# ---------------------------------------------------------------------------
# Tests — file creation via _apply_with_id
# ---------------------------------------------------------------------------


class _FileCreatorMigration(RepoMigration):
    """Creates host_vars for IDs that don't have files on disk."""

    def _host_var_ids(self, layout):
        return super()._host_var_ids(layout) | {"newhost"}

    def up_host_vars(self, host_id, data):
        if host_id == "newhost":
            data["created_by_migration"] = True
        return data

    def down_host_vars(self, host_id, data):
        if host_id == "newhost":
            data.pop("created_by_migration", None)
        return data


class TestFileCreation:

    def test_creates_host_vars_for_new_id(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        _FileCreatorMigration().run_up(layout)

        path = layout.host_vars_file("newhost")
        assert path.is_file()
        assert _load(path)["created_by_migration"] is True

    def test_existing_files_still_processed(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        _FileCreatorMigration().run_up(layout)
        assert _load(layout.host_vars_path / "web1.yml")["http_port"] == 80

    def test_noop_hook_does_not_create_file(self, layout: AnsibleLayout) -> None:
        """Base no-op hook returns {} for missing file — no file created."""
        _scaffold_repo(layout)
        RepoMigration().run_up(layout)
        assert not layout.host_vars_file("ghost").is_file()

    def test_empty_result_deletes_file(self, layout: AnsibleLayout) -> None:
        """Hook returning {} for an existing file removes the file."""

        class _Eraser(RepoMigration):
            def up_host_vars(self, host_id, data):
                return {}

        _scaffold_repo(layout)
        assert layout.host_vars_file("web1").is_file()
        _Eraser().run_up(layout)
        assert not layout.host_vars_file("web1").is_file()


# ---------------------------------------------------------------------------
# Tests — ID collector overrides
# ---------------------------------------------------------------------------


class TestIdCollectors:

    def test_default_host_var_ids_from_disk(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        m = RepoMigration()
        assert m._host_var_ids(layout) == {"web1"}

    def test_default_group_var_ids_from_disk(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        m = RepoMigration()
        assert m._group_var_ids(layout) == {"webservers"}

    def test_override_adds_extra_ids(self, layout: AnsibleLayout) -> None:
        _scaffold_repo(layout)
        tracker = _HookTracker()
        tracker._host_var_ids = lambda layout: (  # type: ignore[method-assign]
            RepoMigration._host_var_ids(tracker, layout) | {"extra"}
        )
        tracker.run_up(layout)
        hv_ids = [eid for name, eid in tracker.calls if name == "host_vars"]
        assert "extra" in hv_ids
        assert "web1" in hv_ids

    def test_empty_dirs_return_empty_set(self, layout: AnsibleLayout) -> None:
        m = RepoMigration()
        assert m._host_var_ids(layout) == set()
        assert m._group_var_ids(layout) == set()
