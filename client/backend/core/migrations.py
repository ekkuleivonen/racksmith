"""Auto-discovering YAML schema migration runner for .racksmith/ repos.

Migration files live in ``core/repo_migrations/`` and follow the naming
convention ``v{NNN}_{description}.py`` (e.g. ``v004_rename_options.py``).
Each file must expose a ``Migration`` class that subclasses
``RepoMigration`` from ``_base.py``.

To add a migration:
  1. Create a new file in repo_migrations/ (e.g. v005_add_field.py)
  2. Subclass RepoMigration and override the up_*/down_* hooks you need
  3. Done — the runner discovers it automatically, and CURRENT_SCHEMA_VERSION
     advances to match the highest migration file found.
"""

from __future__ import annotations

import importlib
import re
from pathlib import Path

from _utils.logging import get_logger

from .config import AnsibleLayout, resolve_layout
from .racksmith_meta import read_meta, write_meta

logger = get_logger(__name__)

_MIGRATION_DIR = Path(__file__).parent / "repo_migrations"
_VERSION_RE = re.compile(r"^v(\d{3,})")
_BASE_SCHEMA_VERSION = 0


def _discover_migrations() -> dict[int, str]:
    """Return ``{version: module_stem}`` for every migration file found."""
    migrations: dict[int, str] = {}
    if not _MIGRATION_DIR.is_dir():
        return migrations
    for f in sorted(_MIGRATION_DIR.glob("v*.py")):
        m = _VERSION_RE.match(f.stem)
        if m:
            migrations[int(m.group(1))] = f.stem
    return migrations


def current_schema_version() -> int:
    """Highest schema version: the greater of the base version and the
    highest discovered migration file."""
    versions = _discover_migrations()
    return max([_BASE_SCHEMA_VERSION, *versions.keys()])


def detect_schema_version(layout: AnsibleLayout) -> int:
    """Read schema_version from .racksmith.yml."""
    meta = read_meta(layout)
    return meta.schema_version


def write_schema_version(
    layout: AnsibleLayout,
    schema_version: int,
    *,
    racksmith_version: str = "dev",
) -> None:
    """Write schema_version and racksmith_version to .racksmith.yml."""
    meta = read_meta(layout)
    meta.schema_version = schema_version
    meta.racksmith_version = racksmith_version
    write_meta(layout, meta)


def _load_migration(module_stem: str):
    """Import a migration module and return its ``Migration`` instance."""
    mod = importlib.import_module(f"core.repo_migrations.{module_stem}")
    return mod.Migration()


def migrate_repo(repo_path: Path, *, racksmith_version: str = "1.0.0") -> None:
    """Ensure all .racksmith/ files match the current schema version.

    Discovers migration files, runs any that haven't been applied yet
    (based on the repo's ``schema_version`` stamp), and updates the stamp.
    """
    layout = resolve_layout(repo_path)
    repo_version = detect_schema_version(layout)
    target = current_schema_version()

    if repo_version < target:
        migrations = _discover_migrations()
        for version in range(repo_version + 1, target + 1):
            module_stem = migrations.get(version)
            if module_stem is None:
                continue
            logger.info(
                "repo_migration_started",
                repo_path=str(repo_path),
                from_version=version - 1,
                to_version=version,
                migration=module_stem,
            )
            try:
                migration = _load_migration(module_stem)
                migration.run_up(layout)
                logger.info(
                    "repo_migration_completed",
                    repo_path=str(repo_path),
                    to_version=version,
                )
            except Exception:
                logger.error(
                    "repo_migration_failed",
                    repo_path=str(repo_path),
                    to_version=version,
                    migration=module_stem,
                    exc_info=True,
                )
                raise

    write_schema_version(layout, target, racksmith_version=racksmith_version)


def rollback_repo(
    repo_path: Path,
    target_version: int,
    *,
    racksmith_version: str = "dev",
) -> None:
    """Roll back .racksmith/ files to *target_version*.

    Runs ``down`` hooks in reverse order for each migration above the
    target version.
    """
    layout = resolve_layout(repo_path)
    repo_version = detect_schema_version(layout)

    if repo_version <= target_version:
        return

    migrations = _discover_migrations()
    for version in range(repo_version, target_version, -1):
        module_stem = migrations.get(version)
        if module_stem is None:
            continue
        logger.info(
            "repo_rollback_started",
            repo_path=str(repo_path),
            from_version=version,
            to_version=version - 1,
            migration=module_stem,
        )
        try:
            migration = _load_migration(module_stem)
            migration.run_down(layout)
            logger.info(
                "repo_rollback_completed",
                repo_path=str(repo_path),
                to_version=version - 1,
            )
        except Exception:
            logger.error(
                "repo_rollback_failed",
                repo_path=str(repo_path),
                from_version=version,
                migration=module_stem,
                exc_info=True,
            )
            raise

    write_schema_version(layout, target_version, racksmith_version=racksmith_version)


def migrate_all_active_repos(*, racksmith_version: str = "1.0.0") -> None:
    """Migrate every user's active repo on startup.

    Scans the workspace for user binding files and runs pending migrations
    for each active repo.  Errors are logged but do not prevent other repos
    from being migrated.
    """
    from auth.workspace import read_active_repo, user_repo_dir, workspace_path

    ws = workspace_path()
    if not ws.is_dir():
        return

    for entry in sorted(ws.iterdir()):
        binding_file = entry / ".racksmith-user.json"
        if not binding_file.is_file():
            continue
        user_id = entry.name
        binding = read_active_repo(user_id)
        if not binding:
            continue
        repo_path = user_repo_dir(user_id, binding.owner, binding.repo)
        if not repo_path.is_dir():
            continue
        try:
            migrate_repo(repo_path, racksmith_version=racksmith_version)
        except Exception:
            logger.error(
                "startup_migration_failed",
                user_id=user_id,
                repo=f"{binding.owner}/{binding.repo}",
                exc_info=True,
            )
