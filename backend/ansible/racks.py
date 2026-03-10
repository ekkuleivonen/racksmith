"""Rack I/O — read/write .racksmith/racks.yml (no Ansible equivalent)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from ruamel.yaml import YAML

from .config import AnsibleLayout


def _yaml_rt() -> YAML:
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.default_flow_style = False
    return y


@dataclass
class RackData:
    id: str
    name: str
    rack_units: int = 12
    rack_width_inches: int = 19
    rack_cols: int = 1
    created_at: str = ""
    updated_at: str = ""


def read_racks(layout: AnsibleLayout) -> list[RackData]:
    """Parse .racksmith/racks.yml."""
    path = layout.racks_file
    if not path.is_file():
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return []
    if not isinstance(data, dict):
        return []
    results: list[RackData] = []
    for rack_id, block in data.items():
        if not isinstance(block, dict):
            continue
        results.append(
            RackData(
                id=rack_id,
                name=str(block.get("name", rack_id)),
                rack_units=int(block.get("rack_units", 12)),
                rack_width_inches=int(block.get("rack_width_inches", 19)),
                rack_cols=int(block.get("rack_cols", 1)),
                created_at=str(block.get("created_at", "")),
                updated_at=str(block.get("updated_at", "")),
            )
        )
    return results


def read_rack(layout: AnsibleLayout, rack_id: str) -> RackData | None:
    """Read a single rack by ID."""
    for rack in read_racks(layout):
        if rack.id == rack_id:
            return rack
    return None


def write_rack(layout: AnsibleLayout, rack: RackData) -> None:
    """Add or update a rack in .racksmith/racks.yml."""
    layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
    path = layout.racks_file
    yaml_rt = _yaml_rt()

    if path.is_file():
        try:
            data = yaml_rt.load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            data = {}
    else:
        data = {}

    if not isinstance(data, dict):
        data = {}
    data.setdefault("schema_version", 1)

    data[rack.id] = {
        "name": rack.name,
        "rack_units": rack.rack_units,
        "rack_width_inches": rack.rack_width_inches,
        "rack_cols": rack.rack_cols,
        "created_at": rack.created_at,
        "updated_at": rack.updated_at,
    }

    path.write_text("", encoding="utf-8")
    yaml_rt.dump(data, path)


def remove_rack(layout: AnsibleLayout, rack_id: str) -> None:
    """Remove a rack from .racksmith/racks.yml."""
    path = layout.racks_file
    if not path.is_file():
        return
    yaml_rt = _yaml_rt()
    try:
        data = yaml_rt.load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return
    if isinstance(data, dict) and rack_id in data:
        del data[rack_id]
        path.write_text("", encoding="utf-8")
        yaml_rt.dump(data, path)
