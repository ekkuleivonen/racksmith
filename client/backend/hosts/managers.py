"""Host business logic backed by ansible/inventory and ansible/rack_nodes."""

from __future__ import annotations

from ipaddress import IPv4Address, IPv4Network

import httpx

from _utils.exceptions import NotFoundError
from _utils.helpers import generate_unique_id
from _utils.logging import get_logger
from _utils.pagination import sort_order_reverse
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
from core.racksmith_meta import read_meta
from daemon.client import daemon_post
from hosts.schemas import (
    BulkImportDiscoveredRequest,
    Host,
    HostCreate,
    HostPlacement,
    HostUpdate,
)
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


def _meta_subnet_cidrs(layout: AnsibleLayout | None) -> list[str]:
    if layout is None:
        return []
    return list(read_meta(layout).subnets.keys())


def _subnet_for_ip(ip: str | None, cidrs: list[str]) -> str | None:
    if not ip or not cidrs:
        return None
    try:
        addr = IPv4Address(ip.split("/")[0].strip())
    except ValueError:
        return None
    for cidr in cidrs:
        try:
            net = IPv4Network(cidr, strict=False)
            if addr in net:
                return str(net)
        except ValueError:
            continue
    return None


def _host_data_to_host(h: HostData, *, subnet: str | None = None) -> Host:
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
        subnet=subnet,
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
        subnet=None,
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
        "mac_address": (data.mac_address or "").strip(),
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
        cidrs = _meta_subnet_cidrs(layout)
        hosts = [
            _host_data_to_host(
                h, subnet=_subnet_for_ip(h.ansible_host, cidrs)
            )
            for h in read_hosts(layout)
        ]
        hosts += [_rack_node_to_host(d) for d in read_rack_nodes(layout)]
        return sorted(
            hosts,
            key=lambda h: (
                (h.name or h.hostname or h.ip_address or h.id).lower(),
                h.id,
            ),
        )

    def list_hosts_filtered(
        self,
        session: SessionData,
        *,
        q: str | None,
        group: str | None,
        label: str | None,
        managed: bool | None,
        subnet: str | None,
        sort: str,
        order: str,
    ) -> list[Host]:
        hosts = self.list_hosts(session)
        qn = (q or "").strip().lower()
        group_ids = [x.strip() for x in (group or "").split(",") if x.strip()]
        label_tokens = [x.strip().lower() for x in (label or "").split(",") if x.strip()]
        subnet_parts = [x.strip() for x in (subnet or "").split(",") if x.strip()]
        nets: list[IPv4Network] = []
        for s in subnet_parts:
            try:
                nets.append(IPv4Network(s, strict=False))
            except ValueError:
                continue

        def matches(h: Host) -> bool:
            if managed is not None and h.managed != managed:
                return False
            if group_ids and not any(g in h.groups for g in group_ids):
                return False
            if label_tokens and not any(
                t in [x.lower() for x in (h.labels or [])] for t in label_tokens
            ):
                return False
            if nets:
                matched = False
                if h.ip_address:
                    try:
                        ip = IPv4Address(h.ip_address.split("/")[0].strip())
                        matched = any(ip in n for n in nets)
                    except ValueError:
                        matched = False
                if not matched and h.subnet:
                    matched = any(str(h.subnet) == str(n) for n in nets)
                if not matched:
                    return False
            if qn:
                hay = " ".join(
                    [
                        h.name or "",
                        h.hostname or "",
                        h.ip_address or "",
                        h.os_family or "",
                        " ".join(h.labels or []),
                    ]
                ).lower()
                if qn not in hay:
                    return False
            return True

        filtered = [h for h in hosts if matches(h)]
        rev = sort_order_reverse(order)
        sk = (sort or "name").lower()

        def sort_key(h: Host) -> str | bool:
            if sk in ("hostname", "host"):
                return (h.hostname or "").lower()
            if sk in ("ip", "ip_address"):
                return h.ip_address or ""
            if sk in ("user", "ssh_user"):
                return (h.ssh_user or "").lower()
            if sk == "labels":
                return ",".join(sorted(x.lower() for x in (h.labels or [])))
            if sk == "id":
                return h.id.lower()
            if sk == "managed":
                return h.managed
            if sk == "os_family":
                return (h.os_family or "").lower()
            return (h.name or h.hostname or h.ip_address or h.id).lower()

        filtered.sort(key=sort_key, reverse=rev)
        return filtered

    def get_host(self, session: SessionData, host_id: str) -> Host:
        layout = get_layout(session)
        cidrs = _meta_subnet_cidrs(layout)
        host_data = read_host(layout, host_id)
        if host_data is not None:
            return _host_data_to_host(
                host_data,
                subnet=_subnet_for_ip(host_data.ansible_host, cidrs),
            )
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
            cidrs = _meta_subnet_cidrs(layout)
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
                subnet=_subnet_for_ip(ip_address, cidrs),
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
            probe = await daemon_post("/ssh/probe", {
                "ip": host.ip_address,
                "ssh_user": host.ssh_user,
                "ssh_port": host.ssh_port,
            }, timeout=30.0)
        except httpx.HTTPStatusError as exc:
            detail = ""
            if exc.response is not None:
                try:
                    detail = exc.response.json().get("detail", exc.response.text)
                except Exception:
                    detail = exc.response.text
            logger.warning("ssh_probe_failed", host_id=host_id, error=type(exc).__name__)
            raise ValueError(detail or f"SSH probe failed ({exc.response.status_code})") from exc
        except Exception as exc:
            logger.warning("ssh_probe_failed", host_id=host_id, error=type(exc).__name__)
            raise ValueError(f"SSH probe failed: {exc}") from exc
        os_family = _os_to_family(probe.get("os", "")) or host.os_family
        layout = get_layout(session)
        cidrs = _meta_subnet_cidrs(layout)
        new_ip = probe.get("ip_address", host.ip_address)
        updated = Host(
            id=host.id,
            hostname=probe.get("name", ""),
            name=host.name or probe.get("name", ""),
            ip_address=new_ip,
            ssh_user=host.ssh_user,
            ssh_port=host.ssh_port,
            managed=host.managed,
            groups=host.groups,
            labels=host.labels or probe.get("labels", []),
            os_family=os_family,
            placement=host.placement,
            mac_address=probe.get("mac_address", ""),
            subnet=_subnet_for_ip(new_ip, cidrs),
            vars=host.vars,
        )
        write_host(layout, _host_to_host_data(updated))
        return updated

    async def relocate_host(
        self,
        session: SessionData,
        host_id: str,
        subnet: str | None = None,
    ) -> tuple[Host, str, str, bool]:
        """ARP-scan via daemon to find a host's new IP by MAC address."""
        host = self.get_host(session, host_id)
        if not host.managed:
            raise ValueError("Only managed hosts can be relocated")
        if not host.mac_address:
            raise ValueError("Host has no MAC address — probe the host first")

        if not subnet:
            try:
                resp = await daemon_post("/discovery/subnet", timeout=5.0)
                subnet = resp.get("subnet", "192.168.1.0/24")
            except Exception:
                subnet = "192.168.1.0/24"

        from arq import create_pool
        from arq.connections import RedisSettings

        import settings
        from _utils.helpers import new_id
        from _utils.redis import AsyncRedis

        scan_id = f"relocate_{new_id()}"
        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        await pool.enqueue_job(
            "execute_network_scan",
            scan_id=scan_id,
            subnet=subnet,
            known_hosts=[{"host_id": host.id, "ip": host.ip_address, "mac": host.mac_address}],
        )
        await pool.close()

        import asyncio
        for _ in range(30):
            await asyncio.sleep(1)
            raw = await AsyncRedis.hgetall(f"racksmith:scan:{scan_id}")
            if raw.get("status") in ("completed", "failed"):
                break

        import json
        devices = json.loads(raw.get("devices", "[]")) if raw else []
        target_mac = host.mac_address.lower()
        new_ip: str | None = None
        for d in devices:
            if d.get("mac", "").lower() == target_mac:
                new_ip = d["ip"]
                break

        if new_ip is None:
            raise NotFoundError(
                f"MAC {host.mac_address} not found on subnet {subnet}"
            )

        previous_ip = host.ip_address
        changed = new_ip != previous_ip

        if changed:
            layout = get_layout(session)
            host_data = _host_to_host_data(
                host.model_copy(update={"ip_address": new_ip})
            )
            write_host(layout, host_data)
            logger.info("host_ip_relocated", host_id=host_id, previous_ip=previous_ip, new_ip=new_ip)
            try:
                host = await self.probe_host(session, host_id)
            except Exception:
                logger.warning("ssh_probe_after_relocate_failed", host_id=host_id, exc_info=True)
                host = self.get_host(session, host_id)
        else:
            logger.info("host_ip_unchanged", host_id=host_id, ip=new_ip)

        return host, previous_ip, new_ip, changed

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

    async def bulk_import_discovered(
        self, session: SessionData, body: BulkImportDiscoveredRequest
    ) -> list[Host]:
        hosts: list[Host] = []
        for d in body.devices:
            create = HostCreate(
                name=(d.hostname or "").strip(),
                ip_address=d.ip.strip(),
                ssh_user=body.ssh_user.strip(),
                ssh_port=body.ssh_port,
                managed=True,
                mac_address=(d.mac or "").strip(),
            )
            host = await self.create_host(session, create)
            hosts.append(host)
        logger.info("bulk_import_discovered", count=len(hosts))
        return hosts

    async def preview_host(self, session: SessionData, data: HostCreate) -> Host:
        """Probe via daemon without saving. Returns Host with id='preview'."""
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
                mac_address=data.mac_address or "",
                subnet=None,
                vars=data.vars,
            )
        probe = await daemon_post("/ssh/probe", {
            "ip": data.ip_address,
            "ssh_user": data.ssh_user,
            "ssh_port": data.ssh_port,
        }, timeout=30.0)
        os_family = _os_to_family(probe.get("os", "")) or data.os_family
        layout = get_layout(session)
        cidrs = _meta_subnet_cidrs(layout)
        prev_ip = probe.get("ip_address", data.ip_address)
        return Host(
            id="preview",
            hostname=probe.get("name", ""),
            name=data.name or probe.get("name", ""),
            ip_address=prev_ip,
            ssh_user=data.ssh_user,
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels or probe.get("labels", []),
            os_family=os_family,
            placement=data.placement,
            mac_address=probe.get("mac_address", ""),
            subnet=_subnet_for_ip(prev_ip, cidrs),
            vars=data.vars,
        )


host_manager = HostManager()
