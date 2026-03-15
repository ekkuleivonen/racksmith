"""Detect and import existing Ansible resources into .racksmith/."""

from __future__ import annotations

import shutil
from pathlib import Path

from _utils.logging import get_logger
from core import resolve_layout
from core.roles import read_role, write_role
from repo.schemas import DetectedAnsiblePaths, ImportAnsibleSummary

logger = get_logger(__name__)


def _read_ansible_cfg_paths(repo_path: Path) -> dict[str, str]:
    """Parse ansible.cfg [defaults] for inventory and roles_path."""
    cfg_path = repo_path / "ansible.cfg"
    if not cfg_path.is_file():
        return {}
    text = cfg_path.read_text(encoding="utf-8")
    result: dict[str, str] = {}
    in_defaults = False
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("[") and line.endswith("]"):
            in_defaults = line.lower() == "[defaults]"
            continue
        if in_defaults and "=" in line:
            key, _, val = line.partition("=")
            result[key.strip().lower()] = val.strip().strip('"\'')
    return result


def detect_ansible(repo_path: Path) -> DetectedAnsiblePaths:
    """Scan repo for common Ansible resource locations."""
    repo_path = Path(repo_path).resolve()
    detected: dict[str, str | None] = {
        "inventory_path": None,
        "roles_path": None,
        "playbooks_path": None,
        "host_vars_path": None,
        "group_vars_path": None,
    }

    ansible_cfg = _read_ansible_cfg_paths(repo_path)

    def _check_dir(path: Path, key: str) -> bool:
        if path.is_dir():
            rel = path.relative_to(repo_path)
            detected[key] = str(rel)
            return True
        return False

    def _check_file(path: Path, key: str) -> bool:
        if path.is_file():
            parent = path.parent
            if parent == repo_path:
                detected[key] = path.name
            else:
                rel = parent.relative_to(repo_path)
                detected[key] = str(rel / path.name)
            return True
        return False

    # Inventory
    inv_val = ansible_cfg.get("inventory", "inventory")
    inv_p = repo_path / inv_val
    if inv_p.is_file() or inv_p.is_dir():
        detected["inventory_path"] = str(inv_p.relative_to(repo_path))
    elif (repo_path / "inventory").is_dir():
        detected["inventory_path"] = "inventory"
    elif (repo_path / "hosts").is_file():
        detected["inventory_path"] = "hosts"
    elif (repo_path / "hosts.yml").is_file():
        detected["inventory_path"] = "hosts.yml"

    # Roles
    roles_val = ansible_cfg.get("roles_path", "roles")
    if ":" in roles_val:
        roles_val = roles_val.split(":")[0]
    roles_p = Path(roles_val)
    if not roles_p.is_absolute():
        roles_p = repo_path / roles_p
    if roles_p.is_dir():
        detected["roles_path"] = str(Path(roles_val).as_posix())
    elif _check_dir(repo_path / "roles", "roles_path"):
        pass

    # Playbooks
    _check_dir(repo_path / "playbooks", "playbooks_path")

    # Host vars / group vars
    _check_dir(repo_path / "host_vars", "host_vars_path")
    _check_dir(repo_path / "group_vars", "group_vars_path")

    return DetectedAnsiblePaths(**detected)


def _resolve_source(repo_path: Path, path_str: str) -> Path:
    """Resolve path_str (relative to repo) to absolute Path.

    Raises ValueError if the resolved path escapes the repo directory.
    """
    p = Path(path_str)
    if not p.is_absolute():
        p = repo_path / p
    resolved = p.resolve()
    repo_resolved = repo_path.resolve()
    if not (resolved == repo_resolved or str(resolved).startswith(str(repo_resolved) + "/")):
        raise ValueError(f"Path escapes repository root: {path_str}")
    return resolved


def _validate_path(repo_path: Path, path_str: str, kind: str) -> None:
    """Raise FileNotFoundError if path does not exist in repo."""
    p = _resolve_source(repo_path, path_str)
    if not p.exists():
        raise FileNotFoundError(f"{kind} path does not exist: {path_str}")


def import_ansible(
    repo_path: Path,
    *,
    inventory_path: str | None = None,
    roles_path: str | None = None,
    playbooks_path: str | None = None,
    host_vars_path: str | None = None,
    group_vars_path: str | None = None,
) -> ImportAnsibleSummary:
    """Import Ansible resources into .racksmith/."""
    repo_path = Path(repo_path).resolve()
    layout = resolve_layout(repo_path)
    summary = ImportAnsibleSummary()

    # Validate paths exist
    for path_str, kind in [
        (inventory_path, "Inventory"),
        (roles_path, "Roles"),
        (playbooks_path, "Playbooks"),
        (host_vars_path, "Host vars"),
        (group_vars_path, "Group vars"),
    ]:
        if path_str:
            _validate_path(repo_path, path_str, kind)

    # Ensure base exists
    layout.inventory_path.parent.mkdir(parents=True, exist_ok=True)

    # Inventory
    if inventory_path:
        src = _resolve_source(repo_path, inventory_path)
        if src.is_file():
            layout.inventory_path.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, layout.inventory_path / "hosts.yml")
            summary.inventory_files = 1
        elif src.is_dir():
            hosts_file = src / "hosts.yml"
            if not hosts_file.is_file():
                hosts_file = src / "hosts.yaml"
            if not hosts_file.is_file():
                hosts_file = src / "hosts"
            if hosts_file.is_file():
                layout.inventory_path.mkdir(parents=True, exist_ok=True)
                shutil.copy2(hosts_file, layout.inventory_path / "hosts.yml")
                summary.inventory_files = 1

    # Host vars
    if host_vars_path:
        src = _resolve_source(repo_path, host_vars_path)
        if src.is_dir():
            layout.host_vars_path.mkdir(parents=True, exist_ok=True)
            for f in src.glob("*.yml"):
                if f.is_file():
                    shutil.copy2(f, layout.host_vars_path / f.name)
                    summary.host_vars_files += 1
            for f in src.glob("*.yaml"):
                if f.is_file() and not (layout.host_vars_path / f.stem).with_suffix(".yml").exists():
                    shutil.copy2(f, layout.host_vars_path / f"{f.stem}.yml")
                    summary.host_vars_files += 1

    # Group vars
    if group_vars_path:
        src = _resolve_source(repo_path, group_vars_path)
        if src.is_dir():
            layout.group_vars_path.mkdir(parents=True, exist_ok=True)
            for f in src.glob("*.yml"):
                if f.is_file():
                    shutil.copy2(f, layout.group_vars_path / f.name)
                    summary.group_vars_files += 1
            for f in src.glob("*.yaml"):
                if f.is_file() and not (layout.group_vars_path / f.stem).with_suffix(".yml").exists():
                    shutil.copy2(f, layout.group_vars_path / f"{f.stem}.yml")
                    summary.group_vars_files += 1

    # Roles: read each (supports action.yaml + meta/main.yml), write as meta/main.yml
    if roles_path:
        src = _resolve_source(repo_path, roles_path)
        if src.is_dir():
            layout.roles_path.mkdir(parents=True, exist_ok=True)
            for sub in src.iterdir():
                if sub.is_dir() and not sub.name.startswith("."):
                    role = read_role(sub)
                    if role is not None:
                        if (layout.roles_path / role.id).exists():
                            logger.warning("role_id_collision_skipped", role_id=role.id)
                            summary.roles_skipped += 1
                            continue
                        tasks_content = None
                        try:
                            from core.roles import read_role_tasks
                            tasks_content = read_role_tasks(sub)
                        except Exception:
                            logger.warning("read_role_tasks_failed", role=sub.name, exc_info=True)
                        write_role(layout, role, tasks_yaml=tasks_content)
                        summary.roles_imported += 1

    # Playbooks
    if playbooks_path:
        src = _resolve_source(repo_path, playbooks_path)
        if src.is_dir():
            layout.playbooks_path.mkdir(parents=True, exist_ok=True)
            for f in sorted(src.glob("*.yml")):
                if f.is_file():
                    shutil.copy2(f, layout.playbooks_path / f.name)
                    summary.playbooks_imported += 1
            for f in sorted(src.glob("*.yaml")):
                if f.is_file() and not (layout.playbooks_path / f.stem).with_suffix(".yml").exists():
                    shutil.copy2(f, layout.playbooks_path / f"{f.stem}.yml")
                    summary.playbooks_imported += 1

    return summary
