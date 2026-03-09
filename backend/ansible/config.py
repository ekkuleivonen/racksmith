"""Path resolution for Ansible layout within a repo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class AnsibleLayout:
    """Resolved paths for inventory, roles, and playbooks within a repo."""

    repo_path: Path
    inventory_path: Path
    host_vars_path: Path
    group_vars_path: Path
    roles_path: Path
    playbooks_path: Path
    racks_file: Path
    devices_file: Path

    def host_vars_file(self, host_id: str) -> Path:
        return self.host_vars_path / f"{host_id}.yml"

    def group_vars_file(self, group_id: str) -> Path:
        return self.group_vars_path / f"{group_id}.yml"


def _read_ansible_cfg(repo_path: Path) -> dict[str, str]:
    """Parse ansible.cfg [defaults] section. Returns empty dict if not found."""
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


def _read_racksmith_config(repo_path: Path) -> dict[str, str]:
    """Parse .racksmith/config.yml. Returns empty dict if not found."""
    cfg_path = repo_path / ".racksmith" / "config.yml"
    if not cfg_path.is_file():
        return {}
    try:
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
        return dict(data) if isinstance(data, dict) else {}
    except (OSError, yaml.YAMLError):
        return {}


def resolve_layout(repo_path: Path) -> AnsibleLayout:
    """Read .racksmith/config.yml + ansible.cfg [defaults], fall back to defaults."""
    repo_path = Path(repo_path).resolve()

    ansible_cfg = _read_ansible_cfg(repo_path)
    racksmith_cfg = _read_racksmith_config(repo_path)

    def _path(key: str, ansible_key: str | None, default: str) -> Path:
        val = racksmith_cfg.get(key)
        if val is None and ansible_key:
            val = ansible_cfg.get(ansible_key)
        val = val or default
        p = Path(val)
        return (repo_path / p) if not p.is_absolute() else p

    inventory_val = racksmith_cfg.get("inventory_path") or ansible_cfg.get(
        "inventory"
    ) or "inventory"
    inv_p = Path(inventory_val)
    if not inv_p.is_absolute():
        inv_p = repo_path / inv_p
    # If ansible.cfg inventory points to a file, use its parent dir
    if inv_p.suffix in (".yml", ".yaml", ".ini") or inv_p.is_file():
        inventory_path = inv_p.parent
    else:
        inventory_path = inv_p

    roles_val = racksmith_cfg.get("roles_path") or ansible_cfg.get("roles_path")
    if roles_val and ":" in roles_val:
        roles_val = roles_val.split(":")[0]
    roles_val = roles_val or "roles"
    roles_path = Path(roles_val)
    if not roles_path.is_absolute():
        roles_path = repo_path / roles_path

    return AnsibleLayout(
        repo_path=repo_path,
        inventory_path=inventory_path,
        host_vars_path=_path("host_vars_path", None, "host_vars"),
        group_vars_path=_path("group_vars_path", None, "group_vars"),
        roles_path=roles_path,
        playbooks_path=_path("playbooks_path", None, "playbooks"),
        racks_file=repo_path / ".racksmith" / "racks.yml",
        devices_file=repo_path / ".racksmith" / "devices.yml",
    )
