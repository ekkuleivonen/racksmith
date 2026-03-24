"""Low-level network scanning helpers: nmap ping scan, reverse DNS."""

from __future__ import annotations

import socket
import subprocess
import xml.etree.ElementTree as ET
from ipaddress import IPv4Network

from racksmith_shared.logging import get_logger

logger = get_logger(__name__)


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


def nmap_scan(subnet: str, timeout: int = 180) -> list[tuple[str, str, str]]:
    """Ping-scan subnet with nmap -sn; returns (ip, hostname, mac) per live host.

    Uses XML output to capture MAC addresses (available when running as root
    on the same L2 segment). Works across routed VLANs for IP/hostname, but
    MACs will only be present for hosts on the local broadcast domain.
    """
    try:
        result = subprocess.run(
            ["nmap", "-sn", "-T4", "-oX", "-", subnet],
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

    devices: list[tuple[str, str, str]] = []
    try:
        root = ET.fromstring(result.stdout or "<nmaprun/>")
    except ET.ParseError:
        logger.error("nmap_xml_parse_failed", stdout_tail=(result.stdout or "")[-500:])
        return devices

    for host_el in root.findall("host"):
        status_el = host_el.find("status")
        if status_el is not None and status_el.get("state") != "up":
            continue
        ip = ""
        mac = ""
        hostname = ""
        for addr in host_el.findall("address"):
            if addr.get("addrtype") == "ipv4":
                ip = addr.get("addr", "")
            elif addr.get("addrtype") == "mac":
                mac = addr.get("addr", "")
        hostnames_el = host_el.find("hostnames")
        if hostnames_el is not None:
            hn = hostnames_el.find("hostname")
            if hn is not None:
                hostname = hn.get("name", "")
        if ip:
            devices.append((ip, hostname, mac))
    return devices


def reverse_dns(ip: str) -> str:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        return ""
