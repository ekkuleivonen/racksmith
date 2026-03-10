"""Unmanaged device I/O — read/write .racksmith/devices.yml (no Ansible relevance)."""

from __future__ import annotations

from dataclasses import dataclass, field
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
class DeviceData:
    id: str
    name: str
    notes: str = ""
    labels: list = field(default_factory=list)
    mac_address: str = ""
    rack: str = ""
    position_u_start: int = 1
    position_u_height: int = 1
    position_col_start: int = 0
    position_col_count: int = 1


def read_devices(layout: AnsibleLayout) -> list[DeviceData]:
    """Parse .racksmith/devices.yml."""
    path = layout.devices_file
    if not path.is_file():
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return []
    if not isinstance(data, dict):
        return []
    results: list[DeviceData] = []
    for device_id, block in data.items():
        if not isinstance(block, dict):
            continue
        results.append(
            DeviceData(
                id=device_id,
                name=str(block.get("name", device_id)),
                notes=str(block.get("notes", "")),
                labels=list(block.get("labels", []) or []),
                mac_address=str(block.get("mac_address", "")),
                rack=str(block.get("rack", "")),
                position_u_start=int(block.get("position_u_start", 1)),
                position_u_height=int(block.get("position_u_height", 1)),
                position_col_start=int(block.get("position_col_start", 0)),
                position_col_count=int(block.get("position_col_count", 1)),
            )
        )
    return results


def read_device(layout: AnsibleLayout, device_id: str) -> DeviceData | None:
    """Read a single device by ID."""
    for device in read_devices(layout):
        if device.id == device_id:
            return device
    return None


def write_device(layout: AnsibleLayout, device: DeviceData) -> None:
    """Add or update a device in .racksmith/devices.yml."""
    layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
    path = layout.devices_file
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

    data[device.id] = {
        "name": device.name,
        "notes": device.notes,
        "labels": device.labels,
        "mac_address": device.mac_address,
        "rack": device.rack,
        "position_u_start": device.position_u_start,
        "position_u_height": device.position_u_height,
        "position_col_start": device.position_col_start,
        "position_col_count": device.position_col_count,
    }

    path.write_text("", encoding="utf-8")
    yaml_rt.dump(data, path)


def remove_device(layout: AnsibleLayout, device_id: str) -> None:
    """Remove a device from .racksmith/devices.yml."""
    path = layout.devices_file
    if not path.is_file():
        return
    yaml_rt = _yaml_rt()
    try:
        data = yaml_rt.load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return
    if isinstance(data, dict) and device_id in data:
        del data[device_id]
        path.write_text("", encoding="utf-8")
        yaml_rt.dump(data, path)
