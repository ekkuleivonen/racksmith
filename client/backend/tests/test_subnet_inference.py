"""Tests for automatic host.subnet inference in hosts.managers."""

from __future__ import annotations

import pytest
import yaml

from hosts.managers import _effective_subnet_for_ip, _infer_ipv4_subnet_24


@pytest.mark.parametrize(
    ("ip", "expected"),
    [
        ("192.168.30.107", "192.168.30.0/24"),
        ("10.5.2.1", "10.5.2.0/24"),
        ("172.20.1.1", "172.20.1.0/24"),
        ("100.64.0.5", "100.64.0.0/24"),
        ("100.127.255.254", "100.127.255.0/24"),
    ],
)
def test_infer_ipv4_subnet_24_private(ip: str, expected: str) -> None:
    assert _infer_ipv4_subnet_24(ip) == expected


@pytest.mark.parametrize(
    "ip",
    ["8.8.8.8", "1.1.1.1", "", None],
)
def test_infer_ipv4_subnet_24_public_or_empty(ip: str | None) -> None:
    assert _infer_ipv4_subnet_24(ip) is None


def test_infer_strips_prefix_len() -> None:
    assert _infer_ipv4_subnet_24("192.168.1.10/32") == "192.168.1.0/24"


def test_effective_subnet_layout_none_uses_infer() -> None:
    assert _effective_subnet_for_ip("192.168.2.50", None) == "192.168.2.0/24"


def test_effective_meta_wins_over_infer(layout) -> None:
    """Configured meta CIDR takes precedence over naive /24."""
    meta_path = layout.racksmith_base / ".racksmith.yml"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(
        yaml.safe_dump({"subnets": {"10.0.0.0/8": {"name": "ten"}}}, sort_keys=False)
    )
    assert _effective_subnet_for_ip("10.5.2.1", layout) == "10.0.0.0/8"
    assert _infer_ipv4_subnet_24("10.5.2.1") == "10.5.2.0/24"
