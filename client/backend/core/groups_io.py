"""Group I/O — read/write groups in Ansible inventory and group_vars.

Racksmith metadata is stored in group_vars/{id}.yml with a ``racksmith_``
prefix, keeping it Ansible-native while avoiding conflicts with user vars.
"""

from __future__ import annotations

from . import yaml_rt as _yaml_rt
from .config import AnsibleLayout
from .inventory_shared import HOSTS_FILENAME, GroupData, _parse_hosts_yml, _yaml_safe

_RACKSMITH_PREFIX = "racksmith_"


def _load_group_vars(
    layout: AnsibleLayout, group_id: str,
) -> tuple[dict, dict]:
    """Load group_vars/{group_id}.yml, splitting by racksmith_ prefix.

    Returns (ansible_vars, racksmith_vars) where racksmith keys have
    their prefix stripped.
    """
    path = layout.group_vars_file(group_id)
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
            racksmith_vars[k[len(_RACKSMITH_PREFIX):]] = v
        else:
            ansible_vars[k] = v
    return ansible_vars, racksmith_vars


def read_groups(layout: AnsibleLayout) -> list[GroupData]:
    """Parse inventory children groups + group_vars/ for vars."""
    _, children = _parse_hosts_yml(layout)
    result: list[GroupData] = []
    for group_id, block in children.items():
        members = list((block.get("hosts") or {}).keys())
        ansible_vars, racksmith_vars = _load_group_vars(layout, group_id)
        result.append(
            GroupData(
                id=group_id,
                members=members,
                ansible_vars=ansible_vars,
                racksmith=racksmith_vars,
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
    ansible_vars, racksmith_vars = _load_group_vars(layout, group_id)
    return GroupData(
        id=group_id,
        members=members,
        ansible_vars=ansible_vars,
        racksmith=racksmith_vars,
    )


def write_group(layout: AnsibleLayout, group: GroupData) -> None:
    """Ensure group exists in inventory children, write group_vars/{id}.yml.

    Racksmith metadata is written to group_vars with the racksmith_ prefix.
    """
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

    # Merge ansible_vars + racksmith (prefixed) into group_vars file
    gv_path = layout.group_vars_file(group.id)
    merged: dict = {}
    if group.ansible_vars:
        merged.update(group.ansible_vars)
    for k, v in group.racksmith.items():
        merged[f"{_RACKSMITH_PREFIX}{k}"] = v

    if merged:
        gv_path.write_text("", encoding="utf-8")
        yaml.dump(merged, gv_path)
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
