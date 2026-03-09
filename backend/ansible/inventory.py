"""Host and group I/O — read/write Ansible inventory, host_vars, group_vars."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ruamel.yaml import YAML

from .config import AnsibleLayout
from .extensions import extract, inject


HOSTS_FILENAME = "hosts.yml"


def _yaml_rt() -> YAML:
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.default_flow_style = False
    return y


@dataclass
class HostData:
    id: str
    ansible_host: str = ""
    ansible_user: str = ""
    ansible_port: int = 22
    ansible_vars: dict = field(default_factory=dict)
    racksmith: dict = field(default_factory=dict)
    groups: list[str] = field(default_factory=list)


@dataclass
class GroupData:
    id: str
    members: list[str] = field(default_factory=list)
    ansible_vars: dict = field(default_factory=dict)
    racksmith: dict = field(default_factory=dict)


def _parse_hosts_yml(layout: AnsibleLayout) -> tuple[dict, dict]:
    """Parse inventory hosts.yml. Returns (hosts_dict, children_dict)."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    if not hosts_file.is_file():
        return {}, {}

    yaml = _yaml_rt()
    data = yaml.load(hosts_file.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}, {}

    all_block = data.get("all") or {}
    hosts = all_block.get("hosts") or {}
    children = all_block.get("children") or {}
    return dict(hosts), dict(children)


def _load_host_vars(layout: AnsibleLayout, host_id: str) -> dict:
    """Load merged vars from host_vars/{host_id}.yml."""
    path = layout.host_vars_file(host_id)
    if not path.is_file():
        return {}
    yaml = _yaml_rt()
    data = yaml.load(path.read_text(encoding="utf-8"))
    return dict(data) if isinstance(data, dict) else {}


def _host_from_inventory_and_vars(
    host_id: str, inv_entry: dict, host_vars: dict, groups: list[str]
) -> HostData:
    """Build HostData from inventory entry + host_vars."""
    ansible_host = inv_entry.get("ansible_host") or host_vars.get("ansible_host") or ""
    ansible_user = inv_entry.get("ansible_user") or host_vars.get("ansible_user") or ""
    ansible_port = inv_entry.get("ansible_port") or host_vars.get("ansible_port") or 22
    if isinstance(ansible_port, str):
        try:
            ansible_port = int(ansible_port)
        except ValueError:
            ansible_port = 22

    combined = {**inv_entry, **host_vars}
    ansible_vars, racksmith = extract(combined)

    for k in ("ansible_host", "ansible_user", "ansible_port"):
        ansible_vars.pop(k, None)

    return HostData(
        id=host_id,
        ansible_host=str(ansible_host),
        ansible_user=str(ansible_user),
        ansible_port=ansible_port,
        ansible_vars=ansible_vars,
        racksmith=racksmith,
        groups=groups,
    )


def read_hosts(layout: AnsibleLayout) -> list[HostData]:
    """Parse inventory/hosts.yml, merge host_vars/*.yml, extract groups from children.

    Ansible-compliant: hosts may appear only in all.hosts, only in children, or both.
    When a host is only in children, inv entry is empty and vars come from host_vars/.
    """
    hosts, children = _parse_hosts_yml(layout)

    host_to_groups: dict[str, list[str]] = {hid: [] for hid in hosts}
    all_host_ids: set[str] = set(hosts)
    for group_id, group_block in children.items():
        group_hosts = group_block.get("hosts") or {}
        for hid in group_hosts:
            all_host_ids.add(hid)
            if hid not in host_to_groups:
                host_to_groups[hid] = []
            host_to_groups[hid].append(group_id)

    result: list[HostData] = []
    for host_id in sorted(all_host_ids):
        inv_entry = hosts.get(host_id, {})
        inv_dict = inv_entry if isinstance(inv_entry, dict) else {}
        host_vars = _load_host_vars(layout, host_id)
        groups = host_to_groups.get(host_id, [])
        result.append(
            _host_from_inventory_and_vars(host_id, inv_dict, host_vars, groups)
        )
    return result


def read_host(layout: AnsibleLayout, host_id: str) -> HostData | None:
    """Read a single host by inventory_hostname.

    Ansible-compliant: host may be in all.hosts or only in children.hosts.
    """
    hosts, children = _parse_hosts_yml(layout)
    in_hosts = host_id in hosts
    in_children = any(
        (block.get("hosts") or {}).get(host_id) is not None
        for block in children.values()
    )
    if not in_hosts and not in_children:
        return None
    inv_entry = hosts.get(host_id, {})
    inv_dict = inv_entry if isinstance(inv_entry, dict) else {}
    host_vars = _load_host_vars(layout, host_id)
    groups = [
        g for g, block in children.items()
        if (block.get("hosts") or {}).get(host_id) is not None
    ]
    return _host_from_inventory_and_vars(host_id, inv_dict, host_vars, groups)


def _load_group_vars(layout: AnsibleLayout, group_id: str) -> tuple[dict, dict]:
    """Load group_vars/{id}.yml, return (ansible_vars, racksmith_vars)."""
    path = layout.group_vars_file(group_id)
    if not path.is_file():
        return {}, {}
    yaml = _yaml_rt()
    data = yaml.load(path.read_text(encoding="utf-8"))
    combined = dict(data) if isinstance(data, dict) else {}
    ansible_vars, racksmith = extract(combined)
    return ansible_vars, racksmith


def read_groups(layout: AnsibleLayout) -> list[GroupData]:
    """Parse inventory children groups + group_vars/ for vars."""
    _, children = _parse_hosts_yml(layout)
    result: list[GroupData] = []
    for group_id, block in children.items():
        members = list((block.get("hosts") or {}).keys())
        ansible_vars, racksmith = _load_group_vars(layout, group_id)
        result.append(
            GroupData(
                id=group_id,
                members=members,
                ansible_vars=ansible_vars,
                racksmith=racksmith,
            )
        )
    return result


def read_group(layout: AnsibleLayout, group_id: str) -> GroupData | None:
    """Read a single group."""
    _, children = _parse_hosts_yml(layout)
    if group_id not in children:
        return None
    block = children[group_id]
    members = list((block.get("hosts") or {}).keys())
    ansible_vars, racksmith = _load_group_vars(layout, group_id)
    return GroupData(
        id=group_id,
        members=members,
        ansible_vars=ansible_vars,
        racksmith=racksmith,
    )


def write_host(layout: AnsibleLayout, host: HostData) -> None:
    """Add or update a host in inventory/hosts.yml + host_vars/{id}.yml."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    layout.inventory_path.mkdir(parents=True, exist_ok=True)
    layout.host_vars_path.mkdir(parents=True, exist_ok=True)
    layout.group_vars_path.mkdir(parents=True, exist_ok=True)

    yaml = _yaml_rt()
    if hosts_file.is_file():
        data = yaml.load(hosts_file.read_text(encoding="utf-8"))
    else:
        data = {}

    if not isinstance(data, dict):
        data = {}
    all_block = data.setdefault("all", {})
    if not isinstance(all_block, dict):
        all_block = {}
        data["all"] = all_block
    hosts = all_block.setdefault("hosts", {})
    if not isinstance(hosts, dict):
        hosts = {}
        all_block["hosts"] = hosts

    inv_entry: dict = {}
    if host.ansible_host:
        inv_entry["ansible_host"] = host.ansible_host
    if host.ansible_user:
        inv_entry["ansible_user"] = host.ansible_user
    if host.ansible_port != 22:
        inv_entry["ansible_port"] = host.ansible_port
    for k, v in host.ansible_vars.items():
        inv_entry[k] = v

    existing = hosts.get(host.id)
    if existing is not None and hasattr(existing, "ca"):
        for k in list(existing.keys()):
            del existing[k]
        for k, v in inv_entry.items():
            existing[k] = v
    else:
        hosts[host.id] = inv_entry

    children = all_block.setdefault("children", {})
    if not isinstance(children, dict):
        children = {}
        all_block["children"] = children

    wanted_groups = set(host.groups)
    for group_id, group_block in list(children.items()):
        if not isinstance(group_block, dict):
            continue
        group_hosts = group_block.get("hosts")
        if not isinstance(group_hosts, dict):
            continue
        if host.id in group_hosts:
            if group_id not in wanted_groups:
                del group_hosts[host.id]
            else:
                wanted_groups.discard(group_id)

    for group_id in wanted_groups:
        group_block = children.setdefault(group_id, {})
        if not isinstance(group_block, dict):
            group_block = {"hosts": {}}
            children[group_id] = group_block
        group_hosts = group_block.setdefault("hosts", {})
        if not isinstance(group_hosts, dict):
            group_hosts = {}
            group_block["hosts"] = group_hosts
        group_hosts[host.id] = {}

    hosts_file.write_text("", encoding="utf-8")
    yaml.dump(data, hosts_file)

    host_vars_path = layout.host_vars_file(host.id)
    if host.racksmith:
        hv_data = inject(host.racksmith)
        host_vars_path.write_text("", encoding="utf-8")
        yaml.dump(hv_data, host_vars_path)
    elif host_vars_path.is_file():
        host_vars_path.unlink()


def remove_host(layout: AnsibleLayout, host_id: str) -> None:
    """Remove host from hosts.yml, delete host_vars/{id}.yml, remove from group children."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    if not hosts_file.is_file():
        return

    yaml = _yaml_rt()
    data = yaml.load(hosts_file.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return

    all_block = data.get("all")
    if isinstance(all_block, dict):
        hosts = all_block.get("hosts")
        if isinstance(hosts, dict) and host_id in hosts:
            del hosts[host_id]
        children = all_block.get("children")
        if isinstance(children, dict):
            for group_block in children.values():
                if isinstance(group_block, dict):
                    group_hosts = group_block.get("hosts")
                    if isinstance(group_hosts, dict) and host_id in group_hosts:
                        del group_hosts[host_id]

    hosts_file.write_text("", encoding="utf-8")
    yaml.dump(data, hosts_file)

    host_vars_path = layout.host_vars_file(host_id)
    if host_vars_path.is_file():
        host_vars_path.unlink()


def write_group(layout: AnsibleLayout, group: GroupData) -> None:
    """Ensure group exists in inventory children, write group_vars/{id}.yml."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    layout.inventory_path.mkdir(parents=True, exist_ok=True)
    layout.group_vars_path.mkdir(parents=True, exist_ok=True)

    yaml = _yaml_rt()
    if hosts_file.is_file():
        data = yaml.load(hosts_file.read_text(encoding="utf-8"))
    else:
        data = {}

    if not isinstance(data, dict):
        data = {}
    all_block = data.setdefault("all", {})
    if not isinstance(all_block, dict):
        all_block = {}
        data["all"] = all_block
    children = all_block.setdefault("children", {})
    if not isinstance(children, dict):
        children = {}
        all_block["children"] = children

    group_block = children.setdefault(group.id, {"hosts": {}})
    if not isinstance(group_block, dict):
        group_block = {"hosts": {}}
        children[group.id] = group_block
    group_hosts = group_block.setdefault("hosts", {})
    if not isinstance(group_hosts, dict):
        group_hosts = {}
        group_block["hosts"] = group_hosts

    wanted_members = set(group.members)
    for stale_id in list(group_hosts.keys()):
        if stale_id not in wanted_members:
            del group_hosts[stale_id]
    for m in wanted_members:
        group_hosts[m] = {}

    hosts_file.write_text("", encoding="utf-8")
    yaml.dump(data, hosts_file)

    gv_path = layout.group_vars_file(group.id)
    if group.ansible_vars or group.racksmith:
        gv_data = {**group.ansible_vars, **inject(group.racksmith)}
        gv_path.write_text("", encoding="utf-8")
        yaml.dump(gv_data, gv_path)
    elif gv_path.is_file():
        gv_path.unlink()


def remove_group(layout: AnsibleLayout, group_id: str) -> None:
    """Remove group from inventory children, delete group_vars/{id}.yml."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    if hosts_file.is_file():
        yaml = _yaml_rt()
        data = yaml.load(hosts_file.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            all_block = data.get("all")
            if isinstance(all_block, dict):
                children = all_block.get("children")
                if isinstance(children, dict) and group_id in children:
                    del children[group_id]
            hosts_file.write_text("", encoding="utf-8")
            yaml.dump(data, hosts_file)

    gv_path = layout.group_vars_file(group_id)
    if gv_path.is_file():
        gv_path.unlink()
