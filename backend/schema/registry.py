"""Schema registry mapping glob patterns to Pydantic models."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pydantic import BaseModel

from schema.models import ActionConfig, GroupConfig, NodeConfig, RackConfig, StackConfig

SCHEMA_REGISTRY: dict[str, type[BaseModel]] = {
    "nodes/*.yaml": NodeConfig,
    "nodes/*.yml": NodeConfig,
    "groups/*.yaml": GroupConfig,
    "groups/*.yml": GroupConfig,
    "racks/*.yaml": RackConfig,
    "racks/*.yml": RackConfig,
    "actions/*/action.yaml": ActionConfig,
    "actions/*/action.yml": ActionConfig,
    "stacks/*.yaml": StackConfig,
    "stacks/*.yml": StackConfig,
}
