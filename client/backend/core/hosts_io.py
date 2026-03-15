"""Host I/O — read/write hosts in Ansible inventory and host_vars.

Targetable racksmith metadata (name, managed, mac_address, os_family, labels)
is stored in ``host_vars/{id}.yml`` with a ``racksmith_`` prefix.

Non-targetable / UI-only metadata (notes, rack placement) is stored in
``.racksmith/.racksmith.yml`` under the ``hosts`` section.
"""

from __future__ import annotations

from . import yaml_rt as _yaml_rt
from .config import AnsibleLayout
from .extensions import HOST_META_ONLY_KEYS
from .inventory_shared import HOSTS_FILENAME, HostData, _parse_hosts_yml, _yaml_safe
from .racksmith_meta import (
    get_host_meta,
    read_meta,
    remove_host_meta,
    set_host_meta,
    write_meta,
)

_RACKSMITH_PREFIX = "racksmith_"


def _load_host_vars(
    layout: AnsibleLayout, host_id: str,
) -> tuple[dict, dict]:
    """Load host_vars/{host_id}.yml, splitting by racksmith_ prefix.

    Returns (ansible_vars, racksmith_vars) where racksmith keys have
    their prefix stripped.  Meta-only keys are excluded even if present
    (they belong in .racksmith.yml).
    """
    path = layout.host_vars_file(host_id)
    if not path.is_file():
        return {}, {}
    yaml = _yaml_safe()
    data = yaml.load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}, {}
    ansible_vars: dict = {}
    racksmith_vars: dict = {}
    for k, v in data.items():
        if k.startswith(_RACKSMITH_PREFIX):
            stripped = k[len(_RACKSMITH_PREFIX):]
            if stripped not in HOST_META_ONLY_KEYS:
                racksmith_vars[stripped] = v
        else:
            ansible_vars[k] = v
    return ansible_vars, racksmith_vars


def _host_from_inventory_and_vars(
    host_id: str, inv_entry: dict,
    ansible_vars: dict, racksmith_vars: dict,
    meta_vars: dict,
    groups: list[str],
) -> HostData:
    """Build HostData from inventory entry + host_vars + .racksmith.yml meta."""
    ansible_host = inv_entry.get("ansible_host") or ansible_vars.get("ansible_host") or ""
    ansible_user = inv_entry.get("ansible_user") or ansible_vars.get("ansible_user") or ""
    ansible_port = inv_entry.get("ansible_port") or ansible_vars.get("ansible_port") or 22
    if isinstance(ansible_port, str):
        try:
            ansible_port = int(ansible_port)
        except ValueError:
            ansible_port = 22

    combined = {**inv_entry, **ansible_vars}
    for k in ("ansible_host", "ansible_user", "ansible_port"):
        combined.pop(k, None)

    merged_racksmith = {**meta_vars, **racksmith_vars}

    return HostData(
        id=host_id,
        ansible_host=str(ansible_host),
        ansible_user=str(ansible_user),
        ansible_port=ansible_port,
        ansible_vars=combined,
        racksmith=merged_racksmith,
        groups=groups,
    )


def read_hosts(layout: AnsibleLayout) -> list[HostData]:
    """Parse inventory/hosts.yml, merge host_vars/*.yml and .racksmith.yml meta.

    Ansible-compliant: hosts may appear only in all.hosts, only in children, or both.
    """
    hosts, children = _parse_hosts_yml(layout)
    meta = read_meta(layout)

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
        ansible_vars, racksmith_vars = _load_host_vars(layout, host_id)
        meta_vars = get_host_meta(meta, host_id)
        groups = host_to_groups.get(host_id, [])
        result.append(
            _host_from_inventory_and_vars(
                host_id, inv_dict, ansible_vars, racksmith_vars, meta_vars, groups,
            )
        )
    return result


def read_host(layout: AnsibleLayout, host_id: str) -> HostData | None:
    """Read a single host by inventory_hostname."""
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
    ansible_vars, racksmith_vars = _load_host_vars(layout, host_id)
    meta = read_meta(layout)
    meta_vars = get_host_meta(meta, host_id)
    groups = [
        g for g, block in children.items()
        if (block.get("hosts") or {}).get(host_id) is not None
    ]
    return _host_from_inventory_and_vars(
        host_id, inv_dict, ansible_vars, racksmith_vars, meta_vars, groups,
    )


def write_host(layout: AnsibleLayout, host: HostData) -> None:
    """Add or update a host in inventory/hosts.yml + host_vars/{id}.yml.

    Targetable racksmith keys go to host_vars with racksmith_ prefix.
    Meta-only keys (notes, rack placement) go to .racksmith.yml hosts section.
    """
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

    # Split racksmith keys: targetable → host_vars, meta-only → .racksmith.yml
    targetable: dict = {}
    meta_only: dict = {}
    for k, v in host.racksmith.items():
        if k in HOST_META_ONLY_KEYS:
            meta_only[k] = v
        else:
            targetable[k] = v

    # Write targetable racksmith keys + ansible vars to host_vars
    host_vars_path = layout.host_vars_file(host.id)
    existing_ansible, _existing_rs = _load_host_vars(layout, host.id)
    merged: dict = {}
    if host.ansible_vars or existing_ansible:
        merged.update({**existing_ansible, **host.ansible_vars} if host.ansible_vars else existing_ansible)
    for k, v in targetable.items():
        merged[f"{_RACKSMITH_PREFIX}{k}"] = v

    if merged:
        host_vars_path.parent.mkdir(parents=True, exist_ok=True)
        host_vars_path.write_text("", encoding="utf-8")
        yaml.dump(merged, host_vars_path)
    elif host_vars_path.is_file():
        host_vars_path.unlink()

    # Write meta-only racksmith keys to .racksmith.yml
    meta = read_meta(layout)
    if meta_only:
        set_host_meta(meta, host.id, meta_only)
    else:
        remove_host_meta(meta, host.id)
    write_meta(layout, meta)


def remove_host(layout: AnsibleLayout, host_id: str) -> None:
    """Remove host from hosts.yml, host_vars/{id}.yml, and .racksmith.yml."""
    hosts_file = layout.inventory_path / HOSTS_FILENAME
    if hosts_file.is_file():
        yaml = _yaml_rt()
        data = yaml.load(hosts_file.read_text(encoding="utf-8"))
        if isinstance(data, dict):
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

    meta = read_meta(layout)
    remove_host_meta(meta, host_id)
    write_meta(layout, meta)
