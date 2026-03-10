"""YAML schema migration runner for .racksmith/ files."""

from __future__ import annotations

from pathlib import Path

import yaml

from _utils.logging import get_logger

from .config import AnsibleLayout, resolve_layout

logger = get_logger(__name__)

CURRENT_SCHEMA_VERSION = 1

VERSION_FILENAME = "version.yml"


def _version_file(layout: AnsibleLayout) -> Path:
    """Path to the authoritative version file in the racksmith base dir."""
    return layout.racks_file.parent / VERSION_FILENAME


def _yaml_rt():
    import ruamel.yaml

    return ruamel.yaml.YAML(typ="rt")


def detect_schema_version(layout: AnsibleLayout) -> int:
    """Read schema_version from version.yml, racks.yml, or fallback to 1."""
    version_path = _version_file(layout)
    if version_path.is_file():
        try:
            data = yaml.safe_load(version_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "schema_version" in data:
                v = data["schema_version"]
                return int(v) if isinstance(v, (int, float)) else 1
        except (OSError, yaml.YAMLError):
            pass

    # Fallback: read from racks.yml if present
    if layout.racks_file.is_file():
        try:
            data = yaml.safe_load(layout.racks_file.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "schema_version" in data:
                v = data["schema_version"]
                return int(v) if isinstance(v, (int, float)) else 1
        except (OSError, yaml.YAMLError):
            pass

    return 1


def write_schema_version(
    layout: AnsibleLayout,
    schema_version: int,
    *,
    racksmith_version: str = "1.0.0",
) -> None:
    """Write schema_version and racksmith_version to version.yml."""
    version_path = _version_file(layout)
    version_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "schema_version": schema_version,
        "racksmith_version": racksmith_version,
    }
    version_path.write_text("", encoding="utf-8")
    yaml_rt = _yaml_rt()
    yaml_rt.dump(data, version_path)


def _run_migration(_layout: AnsibleLayout, version: int) -> None:
    """Run migration from (version-1) to version."""
    # No migrations defined yet; add _migrate_to_2, _migrate_to_3, etc. as needed
    raise NotImplementedError(
        f"No migration implemented for schema version {version}"
    )


def migrate_repo(repo_path: Path, *, racksmith_version: str = "1.0.0") -> None:
    """Ensure all .racksmith/ files match the current schema version."""
    layout = resolve_layout(repo_path)
    current = detect_schema_version(layout)
    if current < CURRENT_SCHEMA_VERSION:
        for version in range(current + 1, CURRENT_SCHEMA_VERSION + 1):
            logger.info(
                "repo_migration_started",
                repo_path=str(repo_path),
                from_version=current,
                to_version=version,
            )
            try:
                _run_migration(layout, version)
                logger.info(
                    "repo_migration_completed",
                    repo_path=str(repo_path),
                    to_version=version,
                )
            except Exception as e:
                logger.error(
                    "repo_migration_failed",
                    repo_path=str(repo_path),
                    from_version=current,
                    to_version=version,
                    error=str(e),
                )
                raise
    # Always ensure version.yml exists (authoritative source)
    write_schema_version(layout, CURRENT_SCHEMA_VERSION, racksmith_version=racksmith_version)
