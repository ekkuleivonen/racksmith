"""Low-level network scanning helpers: nmap ping scan, reverse DNS."""

from __future__ import annotations

import re
import socket
import subprocess
from ipaddress import IPv4Network

from racksmith_shared.logging import get_logger

logger = get_logger(__name__)

# nmap -oG (greppable) lines: Host: 192.168.1.1 (hostname or empty)	Status: Up
_NMAP_GREP_HOST = re.compile(
    r"^Host:\s+(\d+\.\d+\.\d+\.\d+)\s+\(([^)]*)\)\s+Status:\s+Up"
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


def nmap_scan(subnet: str, timeout: int = 180) -> list[tuple[str, str]]:
    """Ping-scan subnet with nmap -sn; returns (ip, hostname) per live host.

    Hostname comes from nmap's resolution when available; empty string otherwise.
    Works across routed VLANs (L3), unlike ARP.
    """
    try:
        result = subprocess.run(
            ["nmap", "-sn", "-T4", "-oG", "-", subnet],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        raise RuntimeError("nmap is not installed")
    except subprocess.TimeoutExpired:
        logger.error("nmap_scan_timeout", subnet=subnet, timeout=timeout)
        raise

    if result.returncode != 0:
        err_tail = (result.stderr or "")[-500:]
        logger.error(
            "nmap_scan_failed",
            exit_code=result.returncode,
            stderr=err_tail,
        )
        raise RuntimeError(f"nmap failed with exit code {result.returncode}")

    devices: list[tuple[str, str]] = []
    for line in (result.stdout or "").splitlines():
        m = _NMAP_GREP_HOST.match(line)
        if m:
            ip, hostname = m.group(1), m.group(2).strip()
            devices.append((ip, hostname))
    return devices


def reverse_dns(ip: str) -> str:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        return ""
