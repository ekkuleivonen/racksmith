"""Rack validation utilities, constants, and constrained type values."""

from __future__ import annotations

COLS_BY_WIDTH: dict[int, int] = {10: 6, 19: 12, 23: 12}


def cols_for_width(width_inches: int, explicit: int = 0) -> int:
    if explicit > 0:
        return explicit
    return COLS_BY_WIDTH.get(width_inches, 12)


def validate_width(width: int) -> None:
    if width not in (10, 19, 23):
        raise ValueError("rack_width_inches must be 10, 19, or 23")


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
