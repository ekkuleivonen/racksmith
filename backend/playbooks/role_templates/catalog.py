"""Aggregates all built-in role templates into a single registry."""

from __future__ import annotations

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.role_templates import (
    disk_usage,
    get_info,
    memory_usage,
    ping,
    reboot_if_required,
    service_status,
    system_upgrade,
    uptime,
)

ROLE_TEMPLATE_SPECS: dict[str, RoleTemplateSpec] = {
    "get_info": get_info.SPEC,
    "ping": ping.SPEC,
    "uptime": uptime.SPEC,
    "disk_usage": disk_usage.SPEC,
    "memory_usage": memory_usage.SPEC,
    "service_status": service_status.SPEC,
    "system_upgrade": system_upgrade.SPEC,
    "reboot_if_required": reboot_if_required.SPEC,
}
