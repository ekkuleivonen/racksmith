"""SSH probing helpers used by rack creation and terminal sessions."""

from __future__ import annotations

from dataclasses import dataclass, field

import asyncssh

import settings


@dataclass
class SSHProbeResult:
    host: str
    name: str
    mac_address: str = ""
    os: str = ""
    hardware_type: str = "server"
    tags: list[str] = field(default_factory=list)


def _connect_kwargs(host: str, username: str, port: int) -> dict:
    kwargs = {
        "host": host,
        "username": username,
        "port": port,
        "connect_timeout": 10,
        "login_timeout": 10,
    }
    if settings.SSH_DISABLE_HOST_KEY_CHECK:
        kwargs["known_hosts"] = None
    return kwargs


def _parse_os_release(raw: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in raw.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"')
    return result


def _detect_os_name(os_release: dict[str, str], uname: str) -> str:
    distro_id = (os_release.get("ID") or "").lower()
    version = (os_release.get("VERSION_ID") or "").lower()
    pretty = (os_release.get("PRETTY_NAME") or "").lower()

    if distro_id == "ubuntu" and version.startswith("24"):
        return "ubuntu-24"
    if distro_id == "ubuntu" and version.startswith("22"):
        return "ubuntu-22"
    if distro_id == "debian" and version.startswith("12"):
        return "debian-12"
    if distro_id == "debian" and version.startswith("11"):
        return "debian-11"
    if distro_id == "rocky" and version.startswith("9"):
        return "rocky-9"
    if distro_id in {"rhel", "redhat", "red hat enterprise linux"} and version.startswith("9"):
        return "rhel-9"
    if distro_id == "opnsense" or "opnsense" in pretty:
        return "opnsense"
    if distro_id == "truenas" or "truenas" in pretty:
        return "truenas"
    if distro_id == "raspbian" or "raspberry" in pretty:
        return "pi-os-64-lite"
    if distro_id == "proxmox" or "proxmox" in pretty:
        return "proxmox"

    uname_lower = uname.lower()
    if "opnsense" in uname_lower:
        return "opnsense"
    if "truenas" in uname_lower:
        return "truenas"
    if "linux" in uname_lower:
        return "ubuntu-24" if distro_id == "ubuntu" else ""
    return ""


def _detect_hardware_type(os_name: str) -> str:
    if os_name == "opnsense":
        return "router"
    if os_name == "truenas":
        return "nas"
    return "server"


def _extract_mac(raw: str) -> str:
    for line in raw.splitlines():
        value = line.strip().lower()
        if not value or value == "00:00:00:00:00:00":
            continue
        if len(value.split(":")) == 6:
            return value
    return ""


def _extract_live_host(conn: asyncssh.SSHClientConnection, fallback: str) -> str:
    peer = conn.get_extra_info("peername")
    if isinstance(peer, tuple) and peer:
        value = str(peer[0]).strip()
        if value:
            return value
    return fallback


async def probe_ssh_target(host: str, username: str, port: int) -> SSHProbeResult:
    try:
        conn = await asyncssh.connect(**_connect_kwargs(host, username, port))
    except Exception as exc:
        raise ValueError(f"Unable to connect to {username}@{host}:{port}: {exc}") from exc

    live_host = _extract_live_host(conn, host)

    try:
        hostname_result = await conn.run(
            "hostnamectl --static 2>/dev/null || hostname 2>/dev/null || uname -n",
            check=False,
        )
        os_release_result = await conn.run("cat /etc/os-release 2>/dev/null", check=False)
        uname_result = await conn.run("uname -srm 2>/dev/null || uname -a", check=False)
        mac_result = await conn.run(
            "ip -o link 2>/dev/null | awk '/link\\/ether/ {print $17}'"
            " | grep -v '^00:00:00:00:00:00$' | head -n 1"
            " || ifconfig -a 2>/dev/null | awk '/ether/ {print $2}' | head -n 1"
            " || cat /sys/class/net/*/address 2>/dev/null"
            " | grep -v '^00:00:00:00:00:00$' | head -n 1",
            check=False,
        )
    finally:
        conn.close()
        await conn.wait_closed()

    hostname = hostname_result.stdout.strip() or host
    os_release = _parse_os_release(os_release_result.stdout)
    uname = uname_result.stdout.strip()
    mac_address = _extract_mac(mac_result.stdout)
    os_name = _detect_os_name(os_release, uname)
    hardware_type = _detect_hardware_type(os_name)

    return SSHProbeResult(
        host=live_host,
        name=hostname or live_host,
        mac_address=mac_address,
        os=os_name,
        hardware_type=hardware_type,
        tags=[],
    )
