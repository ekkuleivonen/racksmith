"""SSH probing helpers used by rack creation and terminal sessions."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import asyncssh
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import settings


@dataclass
class SSHProbeResult:
    host: str
    name: str
    mac_address: str = ""
    os: str = ""
    tags: list[str] = field(default_factory=list)


def _connect_kwargs(host: str, username: str, port: int) -> dict:
    kwargs: dict = {
        "host": host,
        "username": username,
        "port": port,
        "connect_timeout": 10,
        "login_timeout": 10,
    }
    if settings.SSH_DISABLE_HOST_KEY_CHECK:
        kwargs["known_hosts"] = None
    racksmith_priv = _racksmith_ssh_dir() / "id_ed25519"
    if racksmith_priv.is_file():
        kwargs["client_keys"] = [str(racksmith_priv)]
    return kwargs


def _parse_os_release(raw: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in raw.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"')
    return result


def _extract_hostnamectl_os(raw: str) -> str:
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        if key.strip().lower() == "operating system":
            return value.strip()
    return ""


def _detect_os_name(os_release: dict[str, str], hostnamectl_os: str, uname: str) -> str:
    if hostnamectl_os:
        return hostnamectl_os

    pretty = (os_release.get("PRETTY_NAME") or "").strip()
    if pretty:
        return pretty

    name = (os_release.get("NAME") or "").strip()
    version = (os_release.get("VERSION_ID") or "").strip()
    if name and version:
        return f"{name} {version}"
    if name:
        return name

    uname = uname.strip()
    if any(marker in uname.lower() for marker in ("opnsense", "truenas")):
        return uname
    return ""


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


def _racksmith_ssh_dir() -> Path:
    """Directory for Racksmith-generated keys (e.g. /app/data/.ssh in Docker)."""
    return Path(settings.DB_PATH).parent / ".ssh"


def _key_search_dirs() -> list[Path]:
    """Directories to search for SSH keys, in order. Racksmith dir first, then ~/.ssh."""
    return [_racksmith_ssh_dir(), Path.home() / ".ssh"]


def machine_public_key() -> str:
    candidates = [
        "id_ed25519.pub",
        "id_ecdsa.pub",
        "id_rsa.pub",
    ]
    for ssh_dir in _key_search_dirs():
        for name in candidates:
            path = ssh_dir / name
            if path.is_file():
                value = path.read_text(encoding="utf-8").strip()
                if value:
                    return value
    raise FileNotFoundError(
        "No public SSH key found. Add one to ~/.ssh or generate one below."
    )


def generate_ssh_key_pair() -> str:
    """Generate an Ed25519 key pair in ~/.ssh. Returns the public key."""
    ssh_dir = Path.home() / ".ssh"
    ssh_dir.mkdir(parents=True, exist_ok=True)
    ssh_dir.chmod(0o700)

    priv_path = ssh_dir / "id_ed25519"
    pub_path = ssh_dir / "id_ed25519.pub"

    if pub_path.is_file():
        return pub_path.read_text(encoding="utf-8").strip()

    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_key = private_key.public_key()
    public_openssh = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )
    public_str = public_openssh.decode("utf-8") + " racksmith"

    priv_path.write_bytes(private_pem)
    priv_path.chmod(0o600)
    pub_path.write_text(public_str)
    pub_path.chmod(0o644)

    return public_str


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
        hostnamectl_result = await conn.run("hostnamectl 2>/dev/null", check=False)
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
    hostnamectl_os = _extract_hostnamectl_os(hostnamectl_result.stdout)
    os_release = _parse_os_release(os_release_result.stdout)
    uname = uname_result.stdout.strip()
    mac_address = _extract_mac(mac_result.stdout)
    os_name = _detect_os_name(os_release, hostnamectl_os, uname)

    return SSHProbeResult(
        host=live_host,
        name=hostname or live_host,
        mac_address=mac_address,
        os=os_name,
        tags=[],
    )
