"""Path resolution for Ansible layout within a repo.

All resources live under a single base (default .racksmith/). Subdirectory
names are fixed; ansible.cfg is no longer read for path resolution.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class AnsibleLayout:
    """Resolved paths for inventory, roles, and playbooks within a repo."""

    repo_path: Path
    racksmith_base: Path
    racksmith_prefix: str  # repo-relative, e.g. ".racksmith"; empty if base is absolute
    inventory_path: Path
    host_vars_path: Path
    group_vars_path: Path
    roles_path: Path
    playbooks_path: Path

    def host_vars_file(self, host_id: str) -> Path:
        return self.host_vars_path / f"{host_id}.yml"

    def group_vars_file(self, group_id: str) -> Path:
        return self.group_vars_path / f"{group_id}.yml"


def _read_racksmith_config(repo_path: Path) -> dict:
    """Parse .racksmith/config.yml. Returns empty dict if not found.
    Only racksmith_dir is used for path resolution."""
    cfg_path = repo_path / ".racksmith" / "config.yml"
    if not cfg_path.is_file():
        return {}
    try:
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
        return dict(data) if isinstance(data, dict) else {}
    except (OSError, yaml.YAMLError):
        return {}


_layout_cache: dict[Path, AnsibleLayout] = {}


def resolve_layout(repo_path: Path) -> AnsibleLayout:
    """Resolve layout: base = repo_path / racksmith_dir, all paths under base."""
    repo_path = Path(repo_path).resolve()
    if repo_path in _layout_cache:
        return _layout_cache[repo_path]
    racksmith_cfg = _read_racksmith_config(repo_path)
    racksmith_dir = racksmith_cfg.get("racksmith_dir") or ".racksmith"
    base = Path(racksmith_dir)
    if not base.is_absolute():
        base = repo_path / base

    try:
        racksmith_prefix = str(base.relative_to(repo_path))
    except ValueError:
        racksmith_prefix = ""  # base is absolute or outside repo

    layout = AnsibleLayout(
        repo_path=repo_path,
        racksmith_base=base,
        racksmith_prefix=racksmith_prefix,
        inventory_path=base / "inventory",
        host_vars_path=base / "inventory" / "host_vars",
        group_vars_path=base / "inventory" / "group_vars",
        roles_path=base / "roles",
        playbooks_path=base / "playbooks",
    )
    _layout_cache[repo_path] = layout
    return layout


def invalidate_layout_cache(repo_path: Path | None = None) -> None:
    """Clear cached layout(s). Call when repo config may have changed."""
    if repo_path:
        _layout_cache.pop(Path(repo_path).resolve(), None)
    else:
        _layout_cache.clear()
