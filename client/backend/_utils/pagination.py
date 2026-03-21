"""Slice in-memory lists for paginated API responses."""

from __future__ import annotations


def paginate[T](items: list[T], *, page: int, per_page: int) -> tuple[list[T], int]:
    """Return (page_slice, total)."""
    total = len(items)
    start = (page - 1) * per_page
    return items[start : start + per_page], total


def sort_order_reverse(order: str) -> bool:
    return order.lower() == "desc"