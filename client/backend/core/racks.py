"""Rack I/O — read/write racks from .racksmith/.racksmith.yml."""

from __future__ import annotations

from dataclasses import dataclass

from .config import AnsibleLayout
from .racksmith_meta import (
    get_rack_meta,
    read_meta,
    remove_rack_meta,
    set_rack_meta,
    write_meta,
)


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
    """Read all racks from .racksmith.yml."""
    meta = read_meta(layout)
    results: list[RackData] = []
    for rack_id, block in meta.racks.items():
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
    meta = read_meta(layout)
    block = get_rack_meta(meta, rack_id)
    if not block:
        return None
    return RackData(
        id=rack_id,
        name=str(block.get("name", rack_id)),
        rack_units=int(block.get("rack_units", 12)),
        rack_width_inches=int(block.get("rack_width_inches", 19)),
        rack_cols=int(block.get("rack_cols", 1)),
        created_at=str(block.get("created_at", "")),
        updated_at=str(block.get("updated_at", "")),
    )


def write_rack(layout: AnsibleLayout, rack: RackData) -> None:
    """Add or update a rack in .racksmith.yml."""
    meta = read_meta(layout)
    set_rack_meta(meta, rack.id, {
        "name": rack.name,
        "rack_units": rack.rack_units,
        "rack_width_inches": rack.rack_width_inches,
        "rack_cols": rack.rack_cols,
        "created_at": rack.created_at,
        "updated_at": rack.updated_at,
    })
    write_meta(layout, meta)


def remove_rack(layout: AnsibleLayout, rack_id: str) -> None:
    """Remove a rack from .racksmith.yml."""
    meta = read_meta(layout)
    remove_rack_meta(meta, rack_id)
    write_meta(layout, meta)
