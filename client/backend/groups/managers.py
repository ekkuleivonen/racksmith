"""Group business logic backed by ansible/inventory."""

from __future__ import annotations

from _utils.exceptions import AlreadyExistsError, NotFoundError
from _utils.helpers import generate_unique_id
from _utils.logging import get_logger
from _utils.pagination import sort_order_reverse
from _utils.repo_helpers import get_layout, get_layout_or_none
from auth.session import SessionData
from core.config import AnsibleLayout
from core.inventory import GroupData, read_group, read_groups, read_host, remove_group, write_group
from groups.schemas import Group, GroupCreate, GroupUpdate, GroupWithMembers
from hosts.managers import host_manager
from hosts.schemas import HostSummary, HostUpdate

logger = get_logger(__name__)


def _group_data_to_group(g: GroupData) -> Group:
    name = g.racksmith.get("name", g.id)
    description = g.racksmith.get("description", "")
    return Group(id=g.id, name=name, description=description, vars=g.ansible_vars)


def _generate_group_id(layout: AnsibleLayout) -> str:
    existing = {g.id for g in read_groups(layout)}
    return generate_unique_id("group", lambda c: c in existing)


class GroupManager:
    """All group operations delegate to ansible/inventory."""

    def list_groups(self, session: SessionData) -> list[Group]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        groups_data = read_groups(layout)
        groups = [_group_data_to_group(g) for g in groups_data]
        return sorted(groups, key=lambda g: (g.name.lower(), g.id))

    def list_groups_filtered(
        self,
        session: SessionData,
        *,
        q: str | None,
        sort: str,
        order: str,
    ) -> list[Group]:
        groups = self.list_groups(session)
        qn = (q or "").strip().lower()
        filtered = [
            g
            for g in groups
            if not qn or qn in g.name.lower() or qn in (g.description or "").lower()
        ]
        rev = sort_order_reverse(order)
        sk = (sort or "name").lower()

        def sort_key(g: Group) -> tuple[int, str, str]:
            if sk == "id":
                return (0, g.id.lower(), g.id)
            if sk == "description":
                return (0, (g.description or "").lower(), g.id)
            return (0, g.name.lower(), g.id)

        filtered.sort(key=sort_key, reverse=rev)
        return filtered

    def get_group(self, session: SessionData, group_id: str) -> GroupWithMembers:
        layout = get_layout(session)
        group_data = read_group(layout, group_id)
        if group_data is None:
            raise NotFoundError(f"Group {group_id} not found")
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

    def create_group(self, session: SessionData, data: GroupCreate) -> Group:
        layout = get_layout(session)
        group_id = _generate_group_id(layout)
        group_data = GroupData(
            id=group_id,
            members=[],
            ansible_vars=data.vars,
            racksmith={"name": data.name.strip(), "description": data.description.strip()},
        )
        try:
            write_group(layout, group_data)
        except FileNotFoundError as exc:
            raise AlreadyExistsError(str(exc)) from exc
        logger.info("group_created", group_id=group_data.id)
        return _group_data_to_group(group_data)

    def update_group(self, session: SessionData, group_id: str, data: GroupUpdate) -> Group:
        layout = get_layout(session)
        group_data = read_group(layout, group_id)
        if group_data is None:
            raise NotFoundError(f"Group {group_id} not found")
        if data.name is not None:
            group_data.racksmith["name"] = data.name.strip()
        if data.description is not None:
            group_data.racksmith["description"] = data.description.strip()
        if data.vars is not None:
            group_data.ansible_vars = data.vars
        write_group(layout, group_data)
        logger.info("group_updated", group_id=group_id)
        return _group_data_to_group(group_data)

    def delete_group(self, session: SessionData, group_id: str) -> None:
        layout = get_layout(session)
        if read_group(layout, group_id) is None:
            raise NotFoundError(f"Group {group_id} not found")
        remove_group(layout, group_id)
        logger.info("group_deleted", group_id=group_id)

    def add_members(self, session: SessionData, group_id: str, host_ids: list[str]) -> None:
        layout = get_layout(session)
        if read_group(layout, group_id) is None:
            raise NotFoundError(f"Group {group_id} not found")
        for hid in host_ids:
            if read_host(layout, hid) is None:
                continue
            host = host_manager.get_host(session, hid)
            if group_id in host.groups:
                continue
            host_manager.update_host(
                session, hid, HostUpdate(groups=[*host.groups, group_id])
            )
        logger.info("group_members_added", group_id=group_id, count=len(host_ids))

    def remove_member(self, session: SessionData, group_id: str, host_id: str) -> None:
        layout = get_layout(session)
        if read_group(layout, group_id) is None:
            raise NotFoundError(f"Group {group_id} not found")
        if read_host(layout, host_id) is None:
            raise NotFoundError(f"Host {host_id} not found")
        host = host_manager.get_host(session, host_id)
        if group_id not in host.groups:
            return
        host_manager.update_host(
            session,
            host_id,
            HostUpdate(groups=[g for g in host.groups if g != group_id]),
        )
        logger.info("group_member_removed", group_id=group_id, host_id=host_id)


group_manager = GroupManager()
