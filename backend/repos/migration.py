"""One-time migration from legacy Rack+items model to Node/Group/Rack."""

from __future__ import annotations

import re
from pathlib import Path

import shutil
import yaml


def migrate_legacy_structure(repo_path: Path) -> None:
    """One-time migration from old Rack+items model to Node/Group/Rack."""
    rs = repo_path / ".racksmith"
    nodes_dir = rs / "nodes"
    racks_dir = rs / "racks"

    # 1. Extract items from rack YAMLs → individual node files
    if racks_dir.is_dir():
        for rack_file in racks_dir.glob("*.yml"):
            try:
                data = yaml.safe_load(rack_file.read_text(encoding="utf-8"))
            except (OSError, yaml.YAMLError):
                continue
            if not isinstance(data, dict):
                continue
            items = data.pop("items", [])
            rack_slug = data.get("slug") or data.get("id") or rack_file.stem
            data["slug"] = rack_slug
            if "id" in data and "slug" in data:
                del data["id"]
            rack_file.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

            nodes_dir.mkdir(parents=True, exist_ok=True)
            used_slugs: set[str] = set()
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = item.get("name", "")
                item_id = item.get("id", "")
                placement = item.get("placement", "rack")
                node_slug = (
                    re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                    if name
                    else ""
                )
                node_slug = node_slug or re.sub(
                    r"[^a-z0-9]+", "-", item_id.lower()
                ).strip("-") or f"node-{item_id[:8]}"
                node = {
                    "slug": node_slug,
                    "name": name,
                    "host": item.get("host", ""),
                    "ssh_user": item.get("ssh_user", ""),
                    "ssh_port": item.get("ssh_port", 22),
                    "managed": item.get("managed", True),
                    "groups": item.get("tags", []),
                    "tags": [],
                    "mac_address": item.get("mac_address", ""),
                    "os_family": item.get("os") or None,
                }
                if placement == "rack":
                    node["rack"] = rack_slug
                    node["position_u_start"] = item.get("position_u_start", 1)
                    node["position_u_height"] = item.get("position_u_height", 1)
                    node["position_col_start"] = item.get("position_col_start", 0)
                    node["position_col_count"] = item.get("position_col_count", 1)
                node_path = nodes_dir / f"{node_slug}.yaml"
                if not node_path.exists():
                    node_path.write_text(
                        yaml.safe_dump(node, sort_keys=False), encoding="utf-8"
                    )

    # 2. Move ansible_scripts/ into .racksmith/
    old_inv = repo_path / "ansible_scripts" / "inventory"
    new_inv = rs / "inventory"
    if old_inv.is_dir() and not new_inv.exists():
        shutil.move(str(old_inv), str(new_inv))

    old_pb = repo_path / "ansible_scripts" / "playbooks"
    new_pb = rs / "playbooks"
    if old_pb.is_dir():
        new_pb.mkdir(parents=True, exist_ok=True)
        for f in old_pb.glob("*.yml"):
            dest = new_pb / f.name
            if not dest.exists():
                shutil.move(str(f), str(dest))
        for f in old_pb.glob("*.yaml"):
            dest = new_pb / f.name
            if not dest.exists():
                shutil.move(str(f), str(dest))
        roles_src = old_pb / "roles"
        roles_dest = new_pb / "roles"
        if roles_src.is_dir() and not roles_dest.exists():
            shutil.copytree(str(roles_src), str(roles_dest))

    old_ansible = repo_path / "ansible_scripts"
    if old_ansible.is_dir():
        shutil.rmtree(str(old_ansible), ignore_errors=True)
