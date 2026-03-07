"""Shared types for role templates."""

from __future__ import annotations

from dataclasses import dataclass

from playbooks.schemas import RoleTemplate

BUILTIN_ROLE_PREFIX = "_racksmith_"


@dataclass(slots=True)
class RoleTemplateSpec:
    template: RoleTemplate
    role_name: str
    files: dict[str, str]
