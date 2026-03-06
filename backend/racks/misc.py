"""Rack validation utilities and constants."""

from __future__ import annotations

from ipaddress import ip_address

COLS_BY_WIDTH: dict[int, int] = {10: 6, 19: 12}


def cols_for_width(width_inches: int, explicit: int | None = None) -> int:
    if explicit is not None:
        return explicit
    return COLS_BY_WIDTH.get(width_inches, 12)


def validate_width(width: int) -> None:
    if width not in (10, 19):
        raise ValueError("rack_width_inches must be 10 or 19")


def validate_ip(*, has_no_ip: bool, ip_value: str | None) -> str | None:
    if has_no_ip:
        return None
    if not ip_value or not ip_value.strip():
        raise ValueError("ip_address is required unless has_no_ip is true")
    try:
        return str(ip_address(ip_value.strip()))
    except ValueError:
        raise ValueError("Invalid ip_address")


def validate_item_cols(max_cols: int, *, col_start: int, col_count: int) -> None:
    if col_start < 0 or col_count < 1:
        raise ValueError("Invalid item column range")
    if col_start + col_count > max_cols:
        raise ValueError(f"Item columns must fit within {max_cols} columns")


def validate_item_position(rack_units: int, *, u_start: int, u_height: int) -> None:
    if u_start + u_height - 1 > rack_units:
        raise ValueError("Item exceeds rack height")
