"""Group business logic backed by ansible/inventory."""

from __future__ import annotations

from ansible import resolve_layout
from ansible.inventory import GroupData, read_group, read_groups, remove_group, write_group

from github.misc import RepoNotAvailableError
from groups.schemas import Group, GroupInput, GroupWithMembers
from hosts.managers import host_manager
from hosts.schemas import HostSummary
from repos.managers import repos_manager


def _group_data_to_group(g: GroupData) -> Group:
    name = g.racksmith.get("name", g.id)
    description = g.racksmith.get("description", "")
    return Group(id=g.id, name=name, description=description)


class GroupManager:
    """All group operations delegate to ansible/inventory."""

    def list_groups(self, session) -> list[Group]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
        groups_data = read_groups(layout)
        groups = [_group_data_to_group(g) for g in groups_data]
        return sorted(groups, key=lambda g: (g.name.lower(), g.id))

    def get_group(self, session, group_id: str) -> GroupWithMembers:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        group_data = read_group(layout, group_id)
        if group_data is None:
            raise KeyError(f"Group {group_id} not found")
        group = _group_data_to_group(group_data)
        all_hosts = host_manager.list_hosts(session)
        members = [
            HostSummary(
                id=h.id,
                name=h.name,
                hostname=h.hostname,
                ip_address=h.ip_address,
                managed=h.managed,
                groups=h.groups,
                labels=h.labels,
            )
            for h in all_hosts
            if group_id in h.groups
        ]
        return GroupWithMembers(**group.model_dump(), hosts=members)

    def create_group(self, session, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        import re
        import secrets

        SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

        def _slugify(name: str) -> str:
            slug = name.strip().lower()
            slug = re.sub(r"[^a-z0-9_-]+", "_", slug)
            slug = slug.strip("_")
            return slug[:60] if slug else ""

        base = _slugify(data.name) or "group"
        existing = {g.id for g in read_groups(layout)}
        group_id = base
        if group_id in existing:
            for _ in range(100):
                candidate = f"{base}_{secrets.token_hex(2)}"
                if candidate not in existing:
                    group_id = candidate
                    break
            else:
                group_id = f"g_{secrets.token_hex(3)}"
        group_data = GroupData(
            id=group_id,
            members=[],
            ansible_vars={},
            racksmith={"name": data.name.strip(), "description": data.description.strip()},
        )
        write_group(layout, group_data)
        return _group_data_to_group(group_data)

    def update_group(self, session, group_id: str, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        group_data = read_group(layout, group_id)
        if group_data is None:
            raise KeyError(f"Group {group_id} not found")
        group_data.racksmith["name"] = data.name.strip()
        group_data.racksmith["description"] = data.description.strip()
        write_group(layout, group_data)
        return _group_data_to_group(group_data)

    def delete_group(self, session, group_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        if read_group(layout, group_id) is None:
            raise KeyError(f"Group {group_id} not found")
        remove_group(layout, group_id)


group_manager = GroupManager()
