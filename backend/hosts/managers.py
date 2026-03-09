"""Host business logic backed by ansible/inventory."""

from __future__ import annotations

import re
import secrets
from pathlib import Path

import settings
from ansible import resolve_layout
from ansible.inventory import HostData, read_host, read_hosts, remove_host, write_host
from hosts.schemas import Host, HostInput, HostSummary
from repos.managers import repos_manager
from ssh.misc import probe_ssh_target

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def _os_to_family(os_name: str) -> str | None:
    """Derive os_family from probe os string."""
    lower = os_name.lower()
    if "debian" in lower or "ubuntu" in lower:
        return "debian"
    if "rhel" in lower or "centos" in lower or "fedora" in lower:
        return "redhat"
    if "arch" in lower:
        return "arch"
    return None


def _slugify(name: str) -> str:
    """Convert name to a valid inventory hostname slug."""
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9_-]+", "-", slug)
    slug = slug.strip("-")
    if not slug or not SLUG_RE.match(slug):
        return ""
    return slug[:120]


def _generate_host_id(repo_path: Path, layout) -> str:
    """Generate unique host ID for new hosts."""
    for _ in range(100):
        candidate = f"h_{secrets.token_hex(3)}"
        if read_host(layout, candidate) is None:
            return candidate
    raise RuntimeError("Failed to generate unique host ID")


def _host_data_to_host(h: HostData) -> Host:
    """Convert HostData to Host schema."""
    r = h.racksmith
    placement = None
    if r.get("rack"):
        placement = {
            "rack": r["rack"],
            "u_start": r.get("position_u_start", 1),
            "u_height": r.get("position_u_height", 1),
            "col_start": r.get("position_col_start", 0),
            "col_count": r.get("position_col_count", 1),
        }
    return Host(
        id=h.id,
        hostname=r.get("hostname", ""),
        name=r.get("name", ""),
        ip_address=h.ansible_host,
        ssh_user=h.ansible_user,
        ssh_port=h.ansible_port,
        managed=r.get("managed", True),
        groups=h.groups,
        labels=r.get("labels", []) or [],
        os_family=r.get("os_family"),
        notes=r.get("notes", ""),
        placement=placement,
        mac_address=r.get("mac_address", ""),
    )


def _host_input_to_host_data(host_id: str, data: HostInput) -> HostData:
    """Convert HostInput to HostData for writing."""
    racksmith: dict = {
        "name": data.name.strip(),
        "managed": data.managed,
        "notes": data.notes,
        "mac_address": "",
        "os_family": data.os_family,
        "labels": data.labels,
    }
    if data.placement:
        racksmith["rack"] = data.placement.rack
        racksmith["position_u_start"] = data.placement.u_start
        racksmith["position_u_height"] = data.placement.u_height
        racksmith["position_col_start"] = data.placement.col_start
        racksmith["position_col_count"] = data.placement.col_count

    return HostData(
        id=host_id,
        ansible_host=data.ip_address.strip(),
        ansible_user=data.ssh_user.strip(),
        ansible_port=data.ssh_port,
        ansible_vars={},
        racksmith=racksmith,
        groups=data.groups,
    )


def _host_to_host_data(host: Host) -> HostData:
    """Convert Host back to HostData for updates."""
    racksmith: dict = {
        "name": host.name,
        "managed": host.managed,
        "notes": host.notes,
        "mac_address": host.mac_address,
        "os_family": host.os_family,
        "labels": host.labels,
        "hostname": host.hostname,
    }
    if host.placement:
        racksmith["rack"] = host.placement.rack
        racksmith["position_u_start"] = host.placement.u_start
        racksmith["position_u_height"] = host.placement.u_height
        racksmith["position_col_start"] = host.placement.col_start
        racksmith["position_col_count"] = host.placement.col_count

    return HostData(
        id=host.id,
        ansible_host=host.ip_address,
        ansible_user=host.ssh_user,
        ansible_port=host.ssh_port,
        ansible_vars={},
        racksmith=racksmith,
        groups=host.groups,
    )


class HostManager:
    """All host operations delegate to ansible/inventory."""

    def list_hosts(self, session) -> list[Host]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        layout = resolve_layout(repo_path)
        hosts_data = read_hosts(layout)
        hosts = [_host_data_to_host(h) for h in hosts_data]
        return sorted(
            hosts,
            key=lambda h: (
                (h.name or h.hostname or h.ip_address or h.id).lower(),
                h.id,
            ),
        )

    def get_host(self, session, host_id: str) -> Host:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        host_data = read_host(layout, host_id)
        if host_data is None:
            raise KeyError(f"Host {host_id} not found")
        return _host_data_to_host(host_data)

    async def create_host(self, session, data: HostInput) -> Host:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)

        slug = _slugify(data.name) if data.name.strip() else ""
        if slug and read_host(layout, slug) is None:
            host_id = slug
        else:
            host_id = _generate_host_id(repo_path, layout)

        host_data = _host_input_to_host_data(host_id, data)
        write_host(layout, host_data)

        host = _host_data_to_host(host_data)
        if host.managed and host.ip_address and host.ssh_user:
            try:
                host = await self.probe_host(session, host_id)
            except Exception:
                pass
        return host

    def update_host(self, session, host_id: str, data: HostInput) -> Host:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        existing = self.get_host(session, host_id)
        name = data.name.strip() if data.name and data.name.strip() else existing.name
        ip_address = (
            data.ip_address.strip()
            if data.ip_address and data.ip_address.strip()
            else existing.ip_address
        )
        ssh_user = (
            data.ssh_user.strip()
            if data.ssh_user and data.ssh_user.strip()
            else existing.ssh_user
        )
        ssh_port = (
            data.ssh_port
            if data.ssh_port != 22 or existing.ssh_port == 22
            else existing.ssh_port
        )
        host = Host(
            id=host_id,
            hostname=existing.hostname,
            name=name,
            ip_address=ip_address,
            ssh_user=ssh_user,
            ssh_port=ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels,
            os_family=data.os_family or existing.os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=existing.mac_address,
        )
        write_host(layout, _host_to_host_data(host))
        return host

    def delete_host(self, session, host_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        if read_host(layout, host_id) is None:
            raise KeyError(f"Host {host_id} not found")
        remove_host(layout, host_id)

    async def probe_host(self, session, host_id: str) -> Host:
        host = self.get_host(session, host_id)
        if not host.managed or not host.ip_address or not host.ssh_user:
            raise ValueError("Host is not managed or missing ip_address/ssh_user")
        probe = await probe_ssh_target(host.ip_address, host.ssh_user, host.ssh_port)
        os_family = _os_to_family(probe.os) or host.os_family
        updated = Host(
            id=host.id,
            hostname=probe.name,
            name=host.name,
            ip_address=probe.ip_address,
            ssh_user=host.ssh_user,
            ssh_port=host.ssh_port,
            managed=host.managed,
            groups=host.groups,
            labels=host.labels or probe.labels,
            os_family=os_family,
            notes=host.notes,
            placement=host.placement,
            mac_address=probe.mac_address,
        )
        layout = resolve_layout(repos_manager.active_repo_path(session))
        write_host(layout, _host_to_host_data(updated))
        return updated

    async def preview_host(self, data: HostInput) -> Host:
        """Probe without saving. Returns Host with id='preview'."""
        if not data.managed or not data.ip_address or not data.ssh_user:
            return Host(
                id="preview",
                hostname="",
                name=data.name,
                ip_address=data.ip_address,
                ssh_user=data.ssh_user,
                ssh_port=data.ssh_port,
                managed=data.managed,
                groups=data.groups,
                labels=data.labels,
                os_family=data.os_family,
                notes=data.notes,
                placement=data.placement,
                mac_address="",
            )
        probe = await probe_ssh_target(data.ip_address, data.ssh_user, data.ssh_port)
        os_family = _os_to_family(probe.os) or data.os_family
        return Host(
            id="preview",
            hostname=probe.name,
            name=data.name or probe.name,
            ip_address=probe.ip_address,
            ssh_user=data.ssh_user,
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels or probe.labels,
            os_family=os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=probe.mac_address,
        )


host_manager = HostManager()
