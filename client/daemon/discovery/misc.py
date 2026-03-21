"""Low-level network scanning helpers: ARP, vendor lookup, reverse DNS."""

from __future__ import annotations

import re
import socket
import subprocess
from ipaddress import IPv4Network

from racksmith_shared.logging import get_logger

logger = get_logger(__name__)

_ARP_SCAN_LINE = re.compile(
    r"^(\d+\.\d+\.\d+\.\d+)\s+"
    r"([0-9a-fA-F:]{17})"
)


def detect_subnet() -> str:
    try:
        out = subprocess.check_output(
            ["ip", "-o", "-4", "addr", "show"],
            text=True,
            timeout=5,
        )
        for line in out.splitlines():
            parts = line.split()
            iface = parts[1] if len(parts) > 1 else ""
            if iface == "lo":
                continue
            for i, tok in enumerate(parts):
                if tok == "inet" and i + 1 < len(parts):
                    cidr = parts[i + 1]
                    net = IPv4Network(cidr, strict=False)
                    return str(net)
    except Exception:
        logger.debug("ip_addr_parse_failed", exc_info=True)
    return "192.168.1.0/24"


def arp_scan(subnet: str, timeout: int = 3) -> list[tuple[str, str]]:
    try:
        out = subprocess.check_output(
            ["arp-scan", f"--timeout={timeout * 1000}", subnet],
            text=True,
            timeout=timeout + 10,
            stderr=subprocess.STDOUT,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("arp_scan_failed", exit_code=exc.returncode, output=exc.output[:500])
        raise
    except FileNotFoundError:
        raise RuntimeError("arp-scan is not installed")

    devices: list[tuple[str, str]] = []
    for line in out.splitlines():
        m = _ARP_SCAN_LINE.match(line)
        if m:
            devices.append((m.group(1), m.group(2)))
    return devices


def lookup_vendor(mac: str) -> str:
    try:
        from mac_vendor_lookup import MacLookup
        return MacLookup().lookup(mac)
    except Exception:
        return ""


def lookup_vendors(macs: list[str]) -> dict[str, str]:
    try:
        from mac_vendor_lookup import MacLookup
        ml = MacLookup()
        result: dict[str, str] = {}
        for mac in macs:
            try:
                result[mac] = ml.lookup(mac)
            except Exception:
                result[mac] = ""
        return result
    except Exception:
        return {m: "" for m in macs}


def reverse_dns(ip: str) -> str:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        return ""
