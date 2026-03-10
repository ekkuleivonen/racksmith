"""Host business logic backed by ansible/inventory."""

from __future__ import annotations

import secrets
from pathlib import Path

import settings
from _utils.logging import get_logger
from ansible import resolve_layout

logger = get_logger(__name__)
from ansible.devices import (
    DeviceData,
    read_device,
    read_devices,
    remove_device,
    write_device,
)
from ansible.inventory import HostData, read_host, read_hosts, remove_host, write_host
from github.misc import RepoNotAvailableError, user_storage_id
from hosts.schemas import Host, HostCreate, HostSummary, HostUpdate
from _utils.slugs import SLUG_RE, slugify
from repos.managers import repos_manager
from ssh.misc import probe_ssh_target


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


def _generate_host_id(repo_path: Path, layout) -> str:
    """Generate unique host ID for new managed hosts."""
    for _ in range(100):
        candidate = f"h_{secrets.token_hex(3)}"
        if read_host(layout, candidate) is None:
            return candidate
    raise RuntimeError("Failed to generate unique host ID")


def _generate_device_id(repo_path: Path, layout) -> str:
    """Generate unique device ID for new unmanaged devices."""
    for _ in range(100):
        candidate = f"d_{secrets.token_hex(3)}"
        if read_device(layout, candidate) is None:
            return candidate
    raise RuntimeError("Failed to generate unique device ID")


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


def _device_data_to_host(d: DeviceData) -> Host:
    """Convert DeviceData to Host schema."""
    placement = None
    if d.rack:
        placement = {
            "rack": d.rack,
            "u_start": d.position_u_start,
            "u_height": d.position_u_height,
            "col_start": d.position_col_start,
            "col_count": d.position_col_count,
        }
    return Host(
        id=d.id,
        hostname="",
        name=d.name,
        ip_address="",
        ssh_user="",
        ssh_port=22,
        managed=False,
        groups=[],
        labels=d.labels,
        os_family=None,
        notes=d.notes,
        placement=placement,
        mac_address=d.mac_address,
    )


def _host_input_to_host_data(host_id: str, data: HostCreate) -> HostData:
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


def _host_input_to_device_data(device_id: str, data: HostCreate) -> DeviceData:
    """Convert HostInput to DeviceData for unmanaged devices."""
    placement = data.placement
    return DeviceData(
        id=device_id,
        name=data.name.strip(),
        notes=data.notes,
        labels=data.labels,
        mac_address="",
        rack=placement.rack if placement else "",
        position_u_start=placement.u_start if placement else 1,
        position_u_height=placement.u_height if placement else 1,
        position_col_start=placement.col_start if placement else 0,
        position_col_count=placement.col_count if placement else 1,
    )


def _device_data_from_host(host: Host) -> DeviceData:
    """Convert Host back to DeviceData for updates."""
    placement = host.placement
    return DeviceData(
        id=host.id,
        name=host.name,
        notes=host.notes,
        labels=host.labels or [],
        mac_address=host.mac_address or "",
        rack=placement.rack if placement else "",
        position_u_start=placement.u_start if placement else 1,
        position_u_height=placement.u_height if placement else 1,
        position_col_start=placement.col_start if placement else 0,
        position_col_count=placement.col_count if placement else 1,
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
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
        hosts = [_host_data_to_host(h) for h in read_hosts(layout)]
        hosts += [_device_data_to_host(d) for d in read_devices(layout)]
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
        if host_data is not None:
            return _host_data_to_host(host_data)
        device_data = read_device(layout, host_id)
        if device_data is not None:
            return _device_data_to_host(device_data)
        raise KeyError(f"Host {host_id} not found")

    async def create_host(self, session, data: HostCreate) -> Host:
        user_id = user_storage_id(session.user)
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)

        if data.managed:
            slug = slugify(data.name) if data.name.strip() else ""
            if slug and read_host(layout, slug) is None and read_device(layout, slug) is None:
                host_id = slug
            else:
                host_id = _generate_host_id(repo_path, layout)
            host_data = _host_input_to_host_data(host_id, data)
            write_host(layout, host_data)
            host = _host_data_to_host(host_data)
            if host.ip_address and host.ssh_user:
                try:
                    host = await self.probe_host(session, host_id)
                except Exception:
                    pass
        else:
            host_id = _generate_device_id(repo_path, layout)
            device_data = _host_input_to_device_data(host_id, data)
            write_device(layout, device_data)
            host = _device_data_to_host(device_data)
        logger.info("host_created", host_id=host.id, user_id=user_id)
        return host

    def update_host(self, session, host_id: str, data: HostUpdate) -> Host:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        existing = self.get_host(session, host_id)
        in_inventory = read_host(layout, host_id) is not None
        managed = data.managed if data.managed is not None else existing.managed
        managed_changed = managed != existing.managed
        migrate_unmanaged_to_devices = (
            not managed and in_inventory
        )  # was in inventory, now unmanaged -> migrate to devices

        if managed_changed or migrate_unmanaged_to_devices:
            if in_inventory:
                remove_host(layout, host_id)
            if read_device(layout, host_id) is not None:
                remove_device(layout, host_id)

        if managed:
            name = (data.name.strip() or existing.name) if data.name is not None else existing.name
            ip_address = (
                (data.ip_address.strip() or existing.ip_address)
                if data.ip_address is not None
                else existing.ip_address
            )
            ssh_user = (
                (data.ssh_user.strip() or existing.ssh_user)
                if data.ssh_user is not None
                else existing.ssh_user
            )
            ssh_port = data.ssh_port if data.ssh_port is not None else existing.ssh_port
            placement = data.placement if data.placement is not None else existing.placement
            groups = data.groups if data.groups is not None else existing.groups
            labels = data.labels if data.labels is not None else existing.labels
            os_family = data.os_family if data.os_family is not None else existing.os_family
            notes = data.notes if data.notes is not None else existing.notes
            host = Host(
                id=host_id,
                hostname=existing.hostname,
                name=name,
                ip_address=ip_address,
                ssh_user=ssh_user,
                ssh_port=ssh_port,
                managed=True,
                groups=groups,
                labels=labels,
                os_family=os_family,
                notes=notes,
                placement=placement,
                mac_address=existing.mac_address,
            )
            write_host(layout, _host_to_host_data(host))
        else:
            name = (data.name.strip() or existing.name) if data.name is not None else existing.name
            placement = data.placement if data.placement is not None else existing.placement
            notes = data.notes if data.notes is not None else existing.notes
            labels = data.labels if data.labels is not None else existing.labels
            device = DeviceData(
                id=host_id,
                name=name,
                notes=notes,
                labels=labels,
                mac_address=existing.mac_address or "",
                rack=placement.rack if placement else "",
                position_u_start=placement.u_start if placement else 1,
                position_u_height=placement.u_height if placement else 1,
                position_col_start=placement.col_start if placement else 0,
                position_col_count=placement.col_count if placement else 1,
            )
            write_device(layout, device)
            host = _device_data_to_host(device)
        logger.info("host_updated", host_id=host_id)
        return host

    def delete_host(self, session, host_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        in_inventory = read_host(layout, host_id) is not None
        in_devices = read_device(layout, host_id) is not None
        if not in_inventory and not in_devices:
            raise KeyError(f"Host {host_id} not found")
        if in_inventory:
            remove_host(layout, host_id)
        if in_devices:
            remove_device(layout, host_id)
        logger.info("host_removed", host_id=host_id)

    async def probe_host(self, session, host_id: str) -> Host:
        user_id = user_storage_id(session.user)
        host = self.get_host(session, host_id)
        if not host.managed or not host.ip_address or not host.ssh_user:
            raise ValueError("Host is not managed or missing ip_address/ssh_user")
        logger.info("host_refresh_requested", host_id=host_id, user_id=user_id)
        try:
            probe = await probe_ssh_target(host.ip_address, host.ssh_user, host.ssh_port)
        except Exception as e:
            logger.warning("ssh_probe_failed", host_id=host_id, host=host.ip_address, error=str(e))
            raise
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

    async def preview_host(self, data: HostCreate) -> Host:
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
