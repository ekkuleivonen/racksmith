"""Schema registry mapping glob patterns to Pydantic models."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pydantic import BaseModel

from config_schema.models import GroupConfig, NodeConfig, RackConfig

SCHEMA_REGISTRY: dict[str, type[BaseModel]] = {
    "nodes/*.yaml": NodeConfig,
    "nodes/*.yml": NodeConfig,
    "groups/*.yaml": GroupConfig,
    "groups/*.yml": GroupConfig,
    "racks/*.yaml": RackConfig,
    "racks/*.yml": RackConfig,
}
