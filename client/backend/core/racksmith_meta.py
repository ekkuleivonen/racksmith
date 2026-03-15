"""Central racksmith metadata store — .racksmith/.racksmith.yml.

Stores schema version, roles, playbooks, racks, rack nodes, and
non-targetable host metadata (notes, rack placement).  Targetable host
metadata (name, managed, etc.) lives in host_vars with a ``racksmith_``
prefix — see ``hosts_io``.  Group metadata lives in group_vars — see
``groups_io``.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from _utils.logging import get_logger

from . import atomic_yaml_dump
from . import yaml_rt as _yaml_rt
from .config import AnsibleLayout

_meta_lock = threading.Lock()

logger = get_logger(__name__)

RACKSMITH_META_FILENAME = ".racksmith.yml"


@dataclass
class RacksmithMeta:
    schema_version: int = 0
    racksmith_version: str = ""
    hosts: dict[str, dict[str, Any]] = field(default_factory=dict)
    roles: dict[str, dict[str, Any]] = field(default_factory=dict)
    playbooks: dict[str, dict[str, Any]] = field(default_factory=dict)
    racks: dict[str, dict[str, Any]] = field(default_factory=dict)
    rack_nodes: dict[str, dict[str, Any]] = field(default_factory=dict)
    subnets: dict[str, dict[str, Any]] = field(default_factory=dict)


def _meta_file(layout: AnsibleLayout) -> Path:
    return layout.racksmith_base / RACKSMITH_META_FILENAME


def read_meta(layout: AnsibleLayout) -> RacksmithMeta:
    path = _meta_file(layout)
    if not path.is_file():
        return RacksmithMeta()
    try:
        data = _yaml_rt().load(path.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("racksmith_meta_parse_failed", path=str(path), exc_info=True)
        return RacksmithMeta()
    if not isinstance(data, dict):
        return RacksmithMeta()
    return RacksmithMeta(
        schema_version=int(data.get("schema_version", 0)),
        racksmith_version=str(data.get("racksmith_version", "")),
        hosts=dict[str, dict[str, Any]](data.get("hosts") or {}),
        roles=dict[str, dict[str, Any]](data.get("roles") or {}),
        playbooks=dict[str, dict[str, Any]](data.get("playbooks") or {}),
        racks=dict[str, dict[str, Any]](data.get("racks") or {}),
        rack_nodes=dict[str, dict[str, Any]](data.get("rack_nodes") or {}),
        subnets=dict[str, dict[str, Any]](data.get("subnets") or {}),
    )


def write_meta(layout: AnsibleLayout, meta: RacksmithMeta) -> None:
    with _meta_lock:
        path = _meta_file(layout)
        path.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, Any] = {
            "schema_version": meta.schema_version,
        }
        if meta.racksmith_version:
            data["racksmith_version"] = meta.racksmith_version
        for section in ("hosts", "roles", "playbooks", "racks", "rack_nodes", "subnets"):
            block = getattr(meta, section)
            if block:
                data[section] = dict(block)
        atomic_yaml_dump(data, path)


# ── Per-entity helpers ───────────────────────────────────────────────────────


def get_host_meta(meta: RacksmithMeta, host_id: str) -> dict[str, Any]:
    return dict(meta.hosts.get(host_id) or {})


def set_host_meta(meta: RacksmithMeta, host_id: str, data: dict[str, Any]) -> None:
    meta.hosts[host_id] = data


def remove_host_meta(meta: RacksmithMeta, host_id: str) -> None:
    meta.hosts.pop(host_id, None)


def get_role_meta(meta: RacksmithMeta, role_id: str) -> dict[str, Any]:
    return dict(meta.roles.get(role_id) or {})


def set_role_meta(meta: RacksmithMeta, role_id: str, data: dict[str, Any]) -> None:
    meta.roles[role_id] = data


def remove_role_meta(meta: RacksmithMeta, role_id: str) -> None:
    meta.roles.pop(role_id, None)


def get_playbook_meta(meta: RacksmithMeta, pb_id: str) -> dict[str, Any]:
    return dict(meta.playbooks.get(pb_id) or {})


def set_playbook_meta(meta: RacksmithMeta, pb_id: str, data: dict[str, Any]) -> None:
    meta.playbooks[pb_id] = data


def remove_playbook_meta(meta: RacksmithMeta, pb_id: str) -> None:
    meta.playbooks.pop(pb_id, None)


def get_rack_meta(meta: RacksmithMeta, rack_id: str) -> dict[str, Any]:
    return dict(meta.racks.get(rack_id) or {})


def set_rack_meta(meta: RacksmithMeta, rack_id: str, data: dict[str, Any]) -> None:
    meta.racks[rack_id] = data


def remove_rack_meta(meta: RacksmithMeta, rack_id: str) -> None:
    meta.racks.pop(rack_id, None)


def get_rack_node_meta(meta: RacksmithMeta, node_id: str) -> dict[str, Any]:
    return dict(meta.rack_nodes.get(node_id) or {})


def set_rack_node_meta(meta: RacksmithMeta, node_id: str, data: dict[str, Any]) -> None:
    meta.rack_nodes[node_id] = data


def remove_rack_node_meta(meta: RacksmithMeta, node_id: str) -> None:
    meta.rack_nodes.pop(node_id, None)


def get_subnet_meta(meta: RacksmithMeta, cidr: str) -> dict[str, Any]:
    return dict(meta.subnets.get(cidr) or {})


def set_subnet_meta(meta: RacksmithMeta, cidr: str, data: dict[str, Any]) -> None:
    meta.subnets[cidr] = data


def remove_subnet_meta(meta: RacksmithMeta, cidr: str) -> None:
    meta.subnets.pop(cidr, None)
