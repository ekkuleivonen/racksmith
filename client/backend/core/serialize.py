"""Serialize workspace files for daemon job payloads."""

from __future__ import annotations

from pathlib import Path

from core.config import AnsibleLayout


def _read_text_safe(path: Path) -> str:
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return ""


def _read_dir_yamls(dir_path: Path) -> dict[str, str]:
    """Read all .yml/.yaml files in a directory, keyed by stem."""
    result: dict[str, str] = {}
    if not dir_path.is_dir():
        return result
    for f in sorted(dir_path.iterdir()):
        if f.suffix in (".yml", ".yaml") and f.is_file():
            result[f.stem] = f.read_text(encoding="utf-8")
    return result


def _read_role_files(role_dir: Path) -> dict[str, str]:
    """Read all files in a role directory, keyed by relative path."""
    result: dict[str, str] = {}
    if not role_dir.is_dir():
        return result
    for f in sorted(role_dir.rglob("*")):
        if f.is_file():
            try:
                content = f.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            rel = str(f.relative_to(role_dir))
            result[rel] = content
    return result


def serialize_inventory(layout: AnsibleLayout) -> str:
    """Read the inventory hosts.yml content."""
    hosts_file = layout.inventory_path / "hosts.yml"
    if not hosts_file.exists():
        hosts_file = layout.inventory_path / "hosts.yaml"
    return _read_text_safe(hosts_file)


def serialize_host_vars(layout: AnsibleLayout) -> dict[str, str]:
    return _read_dir_yamls(layout.host_vars_path)


def serialize_group_vars(layout: AnsibleLayout) -> dict[str, str]:
    return _read_dir_yamls(layout.group_vars_path)


def serialize_playbook(layout: AnsibleLayout, playbook_id: str) -> str:
    """Read the playbook YAML content."""
    path = layout.playbooks_path / f"{playbook_id}.yml"
    if not path.exists():
        path = layout.playbooks_path / f"{playbook_id}.yaml"
    return _read_text_safe(path)


def serialize_all_role_files(layout: AnsibleLayout) -> dict[str, dict[str, str]]:
    """Read all roles, returning {role_id: {relative_path: content}}."""
    result: dict[str, dict[str, str]] = {}
    if not layout.roles_path.is_dir():
        return result
    for role_dir in sorted(layout.roles_path.iterdir()):
        if role_dir.is_dir():
            files = _read_role_files(role_dir)
            if files:
                result[role_dir.name] = files
    return result


def serialize_role_files(layout: AnsibleLayout, role_id: str) -> dict[str, dict[str, str]]:
    """Read a single role, returning {role_id: {relative_path: content}}."""
    role_dir = layout.roles_path / role_id
    if not role_dir.is_dir():
        return {}
    files = _read_role_files(role_dir)
    if not files:
        return {}
    return {role_id: files}


def serialize_run_payload(layout: AnsibleLayout, playbook_id: str) -> dict:
    """Read all files needed for an Ansible playbook run and return as serialized dict."""
    return {
        "playbook_yaml": serialize_playbook(layout, playbook_id),
        "inventory_yaml": serialize_inventory(layout),
        "host_vars": serialize_host_vars(layout),
        "group_vars": serialize_group_vars(layout),
        "role_files": serialize_all_role_files(layout),
    }
