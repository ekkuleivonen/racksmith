"""Rack node I/O (formerly devices) — read/write from .racksmith/.racksmith.yml."""

from __future__ import annotations

from dataclasses import dataclass

from .config import AnsibleLayout
from .racksmith_meta import (
    get_rack_node_meta,
    read_meta,
    remove_rack_node_meta,
    set_rack_node_meta,
    write_meta,
)


@dataclass
class RackNodeData:
    id: str
    name: str
    rack: str = ""
    position_u_start: int = 1
    position_u_height: int = 1
    position_col_start: int = 0
    position_col_count: int = 1


def read_rack_nodes(layout: AnsibleLayout) -> list[RackNodeData]:
    """Read all rack nodes from .racksmith.yml."""
    meta = read_meta(layout)
    results: list[RackNodeData] = []
    for node_id, block in meta.rack_nodes.items():
        if not isinstance(block, dict):
            continue
        results.append(
            RackNodeData(
                id=node_id,
                name=str(block.get("name", node_id)),
                rack=str(block.get("rack", "")),
                position_u_start=int(block.get("position_u_start", 1)),
                position_u_height=int(block.get("position_u_height", 1)),
                position_col_start=int(block.get("position_col_start", 0)),
                position_col_count=int(block.get("position_col_count", 1)),
            )
        )
    return results


def read_rack_node(layout: AnsibleLayout, node_id: str) -> RackNodeData | None:
    """Read a single rack node by ID."""
    meta = read_meta(layout)
    block = get_rack_node_meta(meta, node_id)
    if not block:
        return None
    return RackNodeData(
        id=node_id,
        name=str(block.get("name", node_id)),
        rack=str(block.get("rack", "")),
        position_u_start=int(block.get("position_u_start", 1)),
        position_u_height=int(block.get("position_u_height", 1)),
        position_col_start=int(block.get("position_col_start", 0)),
        position_col_count=int(block.get("position_col_count", 1)),
    )


def write_rack_node(layout: AnsibleLayout, node: RackNodeData) -> None:
    """Add or update a rack node in .racksmith.yml."""
    meta = read_meta(layout)
    set_rack_node_meta(meta, node.id, {
        "name": node.name,
        "rack": node.rack,
        "position_u_start": node.position_u_start,
        "position_u_height": node.position_u_height,
        "position_col_start": node.position_col_start,
        "position_col_count": node.position_col_count,
    })
    write_meta(layout, meta)


def remove_rack_node(layout: AnsibleLayout, node_id: str) -> None:
    """Remove a rack node from .racksmith.yml."""
    meta = read_meta(layout)
    remove_rack_node_meta(meta, node_id)
    write_meta(layout, meta)
