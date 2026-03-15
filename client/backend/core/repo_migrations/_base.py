"""Base class for repo schema migrations.

Subclass ``RepoMigration`` and override only the ``up_*`` / ``down_*``
hooks you need.  The ``run_up`` / ``run_down`` methods handle file
discovery, YAML round-trip I/O, and write-back (skipped when data is
unchanged to avoid noisy git diffs).

Hook naming convention::

    up_<file_type>   — forward migration
    down_<file_type> — rollback migration

Lifecycle::

    prepare  →  per-file hooks  →  (done)

The ``prepare`` hook receives the full ``AnsibleLayout`` so migrations
can read cross-file state before individual hooks run.

Entity ID collectors (``_host_var_ids``, ``_group_var_ids``) control
which IDs are processed.  Override them to include IDs that don't yet
have files on disk (e.g. hosts in ``.racksmith.yml`` that need new
``host_vars`` files).

See ``v001_template.py`` for a concrete example.
"""

from __future__ import annotations

import copy
import io
from pathlib import Path
from typing import Any

from core import yaml_rt as _yaml_rt
from core.config import AnsibleLayout

_HOOK_NAMES = (
    "racksmith_meta",
    "hosts_yml",
    "host_vars",
    "group_vars",
    "playbook",
    "role_meta",
    "role_defaults",
    "role_tasks",
)


class RepoMigration:
    """Base class for repo schema migrations.

    Override any ``up_*`` / ``down_*`` hook to transform a specific file
    type.  Hooks receive parsed YAML data and must return the (possibly
    modified) data.  The default implementations are identity (no-op).
    """

    # -- Prepare hooks (run before per-file hooks) ----------------------------

    def up_prepare(self, layout: AnsibleLayout) -> None:
        """Called before any forward file hooks. Read cross-file state here."""

    def down_prepare(self, layout: AnsibleLayout) -> None:
        """Called before any rollback file hooks. Read cross-file state here."""

    # -- UP hooks (forward) ---------------------------------------------------

    def up_racksmith_meta(self, data: dict) -> dict:
        return data

    def up_hosts_yml(self, data: dict) -> dict:
        return data

    def up_host_vars(self, host_id: str, data: dict) -> dict:
        return data

    def up_group_vars(self, group_id: str, data: dict) -> dict:
        return data

    def up_playbook(self, playbook_id: str, data: Any) -> Any:
        return data

    def up_role_meta(self, role_id: str, data: dict) -> dict:
        return data

    def up_role_defaults(self, role_id: str, data: dict) -> dict:
        return data

    def up_role_tasks(self, role_id: str, data: Any) -> Any:
        return data

    # -- DOWN hooks (rollback) ------------------------------------------------

    def down_racksmith_meta(self, data: dict) -> dict:
        return data

    def down_hosts_yml(self, data: dict) -> dict:
        return data

    def down_host_vars(self, host_id: str, data: dict) -> dict:
        return data

    def down_group_vars(self, group_id: str, data: dict) -> dict:
        return data

    def down_playbook(self, playbook_id: str, data: Any) -> Any:
        return data

    def down_role_meta(self, role_id: str, data: dict) -> dict:
        return data

    def down_role_defaults(self, role_id: str, data: dict) -> dict:
        return data

    def down_role_tasks(self, role_id: str, data: Any) -> Any:
        return data

    # -- Entity ID collectors (override to add IDs without files) -------------

    def _host_var_ids(self, layout: AnsibleLayout) -> set[str]:
        """Return host IDs to process. Default: stems of host_vars/*.yml."""
        if layout.host_vars_path.is_dir():
            return {f.stem for f in layout.host_vars_path.glob("*.yml")}
        return set()

    def _group_var_ids(self, layout: AnsibleLayout) -> set[str]:
        """Return group IDs to process. Default: stems of group_vars/*.yml."""
        if layout.group_vars_path.is_dir():
            return {f.stem for f in layout.group_vars_path.glob("*.yml")}
        return set()

    # -- Runners --------------------------------------------------------------

    def run_up(self, layout: AnsibleLayout) -> None:
        """Execute forward migration hooks on all repo files."""
        self._run_hooks(layout, "up")

    def run_down(self, layout: AnsibleLayout) -> None:
        """Execute rollback hooks on all repo files."""
        self._run_hooks(layout, "down")

    # -- Internals ------------------------------------------------------------

    def _run_hooks(self, layout: AnsibleLayout, prefix: str) -> None:
        # Prepare: let the migration read cross-file state
        getattr(self, f"{prefix}_prepare")(layout)

        yaml = _yaml_rt()

        # .racksmith.yml
        self._apply_single(
            yaml,
            layout.racksmith_base / ".racksmith.yml",
            getattr(self, f"{prefix}_racksmith_meta"),
        )

        # inventory/hosts.yml
        self._apply_single(
            yaml,
            layout.inventory_path / "hosts.yml",
            getattr(self, f"{prefix}_hosts_yml"),
        )

        # host_vars — driven by _host_var_ids (may include IDs without files)
        host_hook = getattr(self, f"{prefix}_host_vars")
        for host_id in sorted(self._host_var_ids(layout)):
            path = layout.host_vars_file(host_id)
            self._apply_with_id(yaml, path, host_id, host_hook)

        # group_vars — driven by _group_var_ids
        group_hook = getattr(self, f"{prefix}_group_vars")
        for group_id in sorted(self._group_var_ids(layout)):
            path = layout.group_vars_file(group_id)
            self._apply_with_id(yaml, path, group_id, group_hook)

        # playbooks/*.yml
        if layout.playbooks_path.is_dir():
            for f in sorted(layout.playbooks_path.glob("*.yml")):
                hook = getattr(self, f"{prefix}_playbook")
                self._apply_with_id(yaml, f, f.stem, hook)

        # roles/*/meta/main.yml, defaults/main.yml, tasks/main.yml
        if layout.roles_path.is_dir():
            for role_dir in sorted(layout.roles_path.iterdir()):
                if not role_dir.is_dir() or role_dir.name.startswith("."):
                    continue
                role_id = role_dir.name

                meta_path = role_dir / "meta" / "main.yml"
                hook = getattr(self, f"{prefix}_role_meta")
                self._apply_with_id(yaml, meta_path, role_id, hook)

                defaults_path = role_dir / "defaults" / "main.yml"
                hook = getattr(self, f"{prefix}_role_defaults")
                self._apply_with_id(yaml, defaults_path, role_id, hook)

                tasks_path = role_dir / "tasks" / "main.yml"
                hook = getattr(self, f"{prefix}_role_tasks")
                self._apply_with_id(yaml, tasks_path, role_id, hook)

    @staticmethod
    def _load_yaml(yaml, path: Path) -> Any:
        return yaml.load(path.read_text(encoding="utf-8"))

    @staticmethod
    def _dump_yaml(yaml, data: Any, path: Path) -> None:
        buf = io.StringIO()
        yaml.dump(data, buf)
        path.write_text(buf.getvalue(), encoding="utf-8")

    @classmethod
    def _apply_single(cls, yaml, path: Path, hook) -> None:
        """Load file, call hook(data), write back if changed."""
        if not path.is_file():
            return
        original = cls._load_yaml(yaml, path)
        snapshot = copy.deepcopy(original)
        result = hook(original)
        if result != snapshot:
            cls._dump_yaml(yaml, result, path)

    @classmethod
    def _apply_with_id(cls, yaml, path: Path, entity_id: str, hook) -> None:
        """Load file (or start from ``{}``) , call hook, write back if changed.

        When the file doesn't exist the hook receives an empty dict.
        If it returns a non-empty dict the file is created (with parent dirs).
        """
        if path.is_file():
            original = cls._load_yaml(yaml, path)
        else:
            original = {}
        snapshot = copy.deepcopy(original)
        result = hook(entity_id, original)
        if result != snapshot:
            if result:
                path.parent.mkdir(parents=True, exist_ok=True)
                cls._dump_yaml(yaml, result, path)
            elif path.is_file():
                path.unlink()

