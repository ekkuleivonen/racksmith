"""Shared inventory types, constants, and YAML parsing used by hosts_io and groups_io."""

from __future__ import annotations

from dataclasses import dataclass, field

from ruamel.yaml import YAML

from .config import AnsibleLayout

HOSTS_FILENAME = "hosts.yml"


def _yaml_safe() -> YAML:
    """Safe loader for read-only YAML parsing (no arbitrary object deserialization)."""
    return YAML(typ="safe")


@dataclass
class HostData:
    id: str
    ansible_host: str = ""
    ansible_user: str = ""
    ansible_port: int = 22
    ansible_vars: dict = field(default_factory=dict)
    racksmith: dict = field(default_factory=dict)
    groups: list[str] = field(default_factory=list)


@dataclass
class GroupData:
    id: str
    members: list[str] = field(default_factory=list)
    ansible_vars: dict = field(default_factory=dict)
    racksmith: dict = field(default_factory=dict)


def _parse_hosts_yml(layout: AnsibleLayout) -> tuple[dict, dict]:
    """Parse inventory hosts.yml. Returns (hosts_dict, children_dict)."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    if not hosts_file.is_file():
        return {}, {}

    yaml = _yaml_safe()
    data = yaml.load(hosts_file.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}, {}

    all_block = data.get("all") or {}
    hosts = all_block.get("hosts") or {}
    children = all_block.get("children") or {}
    return dict(hosts), dict(children)
