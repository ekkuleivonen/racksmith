"""Rack validation utilities, constants, and constrained type values."""

from __future__ import annotations

from typing import Literal, TypeAlias

COLS_BY_WIDTH: dict[int, int] = {10: 6, 19: 12}

HARDWARE_TYPE_VALUES = (
    "server",
    "pc",
    "switch",
    "router",
    "nas",
    "ups",
    "patch_panel",
)
HardwareType: TypeAlias = Literal["", *HARDWARE_TYPE_VALUES]

OS_VALUES = (
    "ubuntu-24",
    "ubuntu-22",
    "debian-12",
    "debian-11",
    "proxmox",
    "truenas",
    "opnsense",
    "rhel-9",
    "rocky-9",
    "pi-os-64-lite",
)
OperatingSystem: TypeAlias = Literal["", *OS_VALUES]

HARDWARE_TYPE_LABELS: dict[str, str] = {
    "server": "Server",
    "pc": "PC",
    "switch": "Switch",
    "router": "Router",
    "nas": "NAS",
    "ups": "UPS",
    "patch_panel": "Patch Panel",
}

OS_LABELS: dict[str, str] = {
    "ubuntu-24": "Ubuntu 24.04",
    "ubuntu-22": "Ubuntu 22.04",
    "debian-12": "Debian 12",
    "debian-11": "Debian 11",
    "proxmox": "Proxmox VE",
    "truenas": "TrueNAS",
    "opnsense": "OPNsense",
    "rhel-9": "RHEL 9",
    "rocky-9": "Rocky Linux 9",
    "pi-os-64-lite": "PI OS 64 lite (raspberry pi)",
}

HARDWARE_TYPES: list[dict[str, str]] = [
    {"value": value, "label": HARDWARE_TYPE_LABELS[value]}
    for value in HARDWARE_TYPE_VALUES
]

OS_OPTIONS: list[dict[str, str]] = [
    {"value": value, "label": OS_LABELS[value]}
    for value in OS_VALUES
]

OS_FAMILY: dict[str, str] = {
    "ubuntu-24": "debian",
    "ubuntu-22": "debian",
    "debian-12": "debian",
    "debian-11": "debian",
    "proxmox": "debian",
    "truenas": "bsd",
    "opnsense": "bsd",
    "rhel-9": "redhat",
    "rocky-9": "redhat",
    "pi-os-64-lite": "debian",
}

TYPES_WITH_OS: list[str] = ["server", "pc", "nas", "router"]

PASSIVE_TYPES: list[str] = ["ups", "patch_panel"]


def cols_for_width(width_inches: int, explicit: int = 0) -> int:
    if explicit > 0:
        return explicit
    return COLS_BY_WIDTH.get(width_inches, 12)


def validate_width(width: int) -> None:
    if width not in (10, 19):
        raise ValueError("rack_width_inches must be 10 or 19")


def validate_host(value: str) -> str:
    return value.strip()


def validate_item_cols(max_cols: int, *, col_start: int, col_count: int) -> None:
    if col_start < 0 or col_count < 1:
        raise ValueError("Invalid item column range")
    if col_start + col_count > max_cols:
        raise ValueError(f"Item columns must fit within {max_cols} columns")


def validate_item_position(rack_units: int, *, u_start: int, u_height: int) -> None:
    if u_start + u_height - 1 > rack_units:
        raise ValueError("Item exceeds rack height")
