"""Host business logic backed by ansible/inventory and ansible/rack_nodes."""

from __future__ import annotations

from _utils.exceptions import NotFoundError
from _utils.helpers import generate_unique_id
from _utils.logging import get_logger
from _utils.repo_helpers import get_layout, get_layout_or_none
from auth.session import SessionData, user_storage_id
from core.config import AnsibleLayout
from core.inventory import HostData, read_host, read_hosts, remove_host, write_host
from core.rack_nodes import (
    RackNodeData,
    read_rack_node,
    read_rack_nodes,
    remove_rack_node,
    write_rack_node,
)
from core.racks import read_rack
from hosts.schemas import Host, HostCreate, HostPlacement, HostUpdate
from hosts.ssh_misc import probe_ssh_target
from racks.misc import validate_item_cols, validate_item_position

logger = get_logger(__name__)


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


def _generate_host_id(layout: AnsibleLayout) -> str:
    return generate_unique_id("host", lambda c: read_host(layout, c) is not None)


def _generate_rack_node_id(layout: AnsibleLayout) -> str:
    return generate_unique_id("racknode", lambda c: read_rack_node(layout, c) is not None)


def _host_data_to_host(h: HostData) -> Host:
    r = h.racksmith
    placement = None
    if r.get("rack"):
        placement = HostPlacement(
            rack=r["rack"],
            u_start=r.get("position_u_start", 1),
            u_height=r.get("position_u_height", 1),
            col_start=r.get("position_col_start", 0),
            col_count=r.get("position_col_count", 1),
        )
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
        placement=placement,
        mac_address=r.get("mac_address", ""),
        vars=h.ansible_vars,
    )


def _rack_node_to_host(d: RackNodeData) -> Host:
    placement = None
    if d.rack:
        placement = HostPlacement(
            rack=d.rack,
            u_start=d.position_u_start,
            u_height=d.position_u_height,
            col_start=d.position_col_start,
            col_count=d.position_col_count,
        )
    return Host(
        id=d.id,
        hostname="",
        name=d.name,
        ip_address="",
        ssh_user="",
        ssh_port=22,
        managed=False,
        groups=[],
        labels=[],
        os_family=None,
        placement=placement,
        mac_address="",
    )


def _validate_placement(layout: AnsibleLayout, placement: HostPlacement | None) -> None:
    """Validate that placement fits within the target rack's dimensions."""
    if placement is None:
        return
    rack = read_rack(layout, placement.rack)
    if rack is None:
        raise ValueError(f"Rack {placement.rack!r} not found")
    validate_item_position(rack.rack_units, u_start=placement.u_start, u_height=placement.u_height)
    validate_item_cols(rack.rack_cols, col_start=placement.col_start, col_count=placement.col_count)


def _host_input_to_host_data(host_id: str, data: HostCreate) -> HostData:
    racksmith: dict = {
        "name": data.name.strip(),
        "managed": data.managed,
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
        ansible_vars=data.vars,
        racksmith=racksmith,
        groups=data.groups,
    )


def _host_input_to_rack_node(node_id: str, data: HostCreate) -> RackNodeData:
    placement = data.placement
    return RackNodeData(
        id=node_id,
        name=data.name.strip(),
        rack=placement.rack if placement else "",
        position_u_start=placement.u_start if placement else 1,
        position_u_height=placement.u_height if placement else 1,
        position_col_start=placement.col_start if placement else 0,
        position_col_count=placement.col_count if placement else 1,
    )


def _host_to_host_data(host: Host) -> HostData:
    racksmith: dict = {
        "name": host.name,
        "managed": host.managed,
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
        ansible_vars=host.vars,
        racksmith=racksmith,
        groups=host.groups,
    )


class HostManager:
    """All host operations delegate to ansible/inventory + ansible/rack_nodes."""

    def list_hosts(self, session: SessionData) -> list[Host]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        hosts = [_host_data_to_host(h) for h in read_hosts(layout)]
        hosts += [_rack_node_to_host(d) for d in read_rack_nodes(layout)]
        return sorted(
            hosts,
            key=lambda h: (
                (h.name or h.hostname or h.ip_address or h.id).lower(),
                h.id,
            ),
        )

    def get_host(self, session: SessionData, host_id: str) -> Host:
        layout = get_layout(session)
        host_data = read_host(layout, host_id)
        if host_data is not None:
            return _host_data_to_host(host_data)
        node_data = read_rack_node(layout, host_id)
        if node_data is not None:
            return _rack_node_to_host(node_data)
        raise NotFoundError(f"Host {host_id} not found")

    async def create_host(self, session: SessionData, data: HostCreate) -> Host:
        user_id = user_storage_id(session.user)
        layout = get_layout(session)
        _validate_placement(layout, data.placement)

        if data.managed:
            host_id = _generate_host_id(layout)
            host_data = _host_input_to_host_data(host_id, data)
            write_host(layout, host_data)
            host = _host_data_to_host(host_data)
            if host.ip_address and host.ssh_user:
                try:
                    host = await self.probe_host(session, host_id)
                except Exception:
                    logger.warning("ssh_probe_failed_on_create", host_id=host_id, exc_info=True)
        else:
            node_id = _generate_rack_node_id(layout)
            node_data = _host_input_to_rack_node(node_id, data)
            write_rack_node(layout, node_data)
            host = _rack_node_to_host(node_data)
        logger.info("host_created", host_id=host.id, user_id=user_id)
        return host

    def update_host(self, session: SessionData, host_id: str, data: HostUpdate) -> Host:
        layout = get_layout(session)
        existing = self.get_host(session, host_id)
        in_inventory = read_host(layout, host_id) is not None
        managed = data.managed if data.managed is not None else existing.managed
        managed_changed = managed != existing.managed
        migrate_to_rack_nodes = not managed and in_inventory

        placement_explicitly_set = "placement" in data.model_fields_set
        final_placement = data.placement if placement_explicitly_set else existing.placement
        _validate_placement(layout, final_placement)

        if managed_changed or migrate_to_rack_nodes:
            if in_inventory:
                remove_host(layout, host_id)
            if read_rack_node(layout, host_id) is not None:
                remove_rack_node(layout, host_id)

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
            placement = data.placement if placement_explicitly_set else existing.placement
            groups = data.groups if data.groups is not None else existing.groups
            labels = data.labels if data.labels is not None else existing.labels
            os_family = data.os_family if data.os_family is not None else existing.os_family
            vars_ = data.vars if data.vars is not None else existing.vars
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
                placement=placement,
                mac_address=existing.mac_address,
                vars=vars_,
            )
            write_host(layout, _host_to_host_data(host))
        else:
            name = (data.name.strip() or existing.name) if data.name is not None else existing.name
            placement = data.placement if placement_explicitly_set else existing.placement
            node = RackNodeData(
                id=host_id,
                name=name,
                rack=placement.rack if placement else "",
                position_u_start=placement.u_start if placement else 1,
                position_u_height=placement.u_height if placement else 1,
                position_col_start=placement.col_start if placement else 0,
                position_col_count=placement.col_count if placement else 1,
            )
            write_rack_node(layout, node)
            host = _rack_node_to_host(node)
        logger.info("host_updated", host_id=host_id)
        return host

    def delete_host(self, session: SessionData, host_id: str) -> None:
        layout = get_layout(session)
        in_inventory = read_host(layout, host_id) is not None
        in_rack_nodes = read_rack_node(layout, host_id) is not None
        if not in_inventory and not in_rack_nodes:
            raise NotFoundError(f"Host {host_id} not found")
        if in_inventory:
            remove_host(layout, host_id)
        if in_rack_nodes:
            remove_rack_node(layout, host_id)
        logger.info("host_removed", host_id=host_id)

    async def probe_host(self, session: SessionData, host_id: str) -> Host:
        user_id = user_storage_id(session.user)
        host = self.get_host(session, host_id)
        if not host.managed or not host.ip_address or not host.ssh_user:
            raise ValueError("Host is not managed or missing ip_address/ssh_user")
        logger.info("host_refresh_requested", host_id=host_id, user_id=user_id)
        try:
            probe = await probe_ssh_target(host.ip_address, host.ssh_user, host.ssh_port)
        except Exception as exc:
            logger.warning("ssh_probe_failed", host_id=host_id, error=type(exc).__name__)
            raise
        os_family = _os_to_family(probe.os) or host.os_family
        updated = Host(
            id=host.id,
            hostname=probe.name,
            name=host.name or probe.name,
            ip_address=probe.ip_address,
            ssh_user=host.ssh_user,
            ssh_port=host.ssh_port,
            managed=host.managed,
            groups=host.groups,
            labels=host.labels or probe.labels,
            os_family=os_family,
            placement=host.placement,
            mac_address=probe.mac_address,
            vars=host.vars,
        )
        layout = get_layout(session)
        write_host(layout, _host_to_host_data(updated))
        return updated

    def bulk_add_label(self, session: SessionData, host_ids: list[str], label: str) -> int:
        layout = get_layout(session)
        updated = 0
        for host_id in host_ids:
            host_data = read_host(layout, host_id)
            if host_data is None:
                continue
            host = _host_data_to_host(host_data)
            if label in host.labels:
                continue
            host.labels = list(host.labels) + [label]
            write_host(layout, _host_to_host_data(host))
            updated += 1
        logger.info("bulk_add_label", label=label, updated=updated)
        return updated

    def bulk_add_to_group(self, session: SessionData, host_ids: list[str], group_id: str) -> int:
        layout = get_layout(session)
        updated = 0
        for host_id in host_ids:
            host_data = read_host(layout, host_id)
            if host_data is None:
                continue
            host = _host_data_to_host(host_data)
            if group_id in host.groups:
                continue
            host.groups = list(host.groups) + [group_id]
            write_host(layout, _host_to_host_data(host))
            updated += 1
        logger.info("bulk_add_to_group", group_id=group_id, updated=updated)
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
                placement=data.placement,
                mac_address="",
                vars=data.vars,
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
            placement=data.placement,
            mac_address=probe.mac_address,
            vars=data.vars,
        )


host_manager = HostManager()
