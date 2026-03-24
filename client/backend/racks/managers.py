"""Rack business logic backed by ansible/racks.py."""

from __future__ import annotations

from _utils.exceptions import AlreadyExistsError, NotFoundError
from _utils.helpers import generate_unique_id, now_iso
from _utils.logging import get_logger
from _utils.pagination import sort_order_reverse
from _utils.repo_helpers import get_layout, get_layout_or_none
from auth.session import SessionData
from core.racks import RackData, read_rack, read_racks, remove_rack, write_rack
from hosts.managers import host_manager
from hosts.schemas import HostUpdate
from racks.misc import cols_for_width, validate_width
from racks.schemas import Rack, RackCreate, RackLayout, RackLayoutHost, RackSummary, RackUpdate

logger = get_logger(__name__)


def _rack_data_to_rack(r: RackData) -> Rack:
    return Rack(
        id=r.id,
        name=r.name,
        rack_width_inches=r.rack_width_inches,
        rack_units=r.rack_units,
        rack_cols=r.rack_cols,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


class RackManager:
    """All rack operations delegate to ansible/racks."""

    def list_racks(self, session: SessionData) -> list[RackSummary]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        racks_data = read_racks(layout)
        return sorted(
            [
                RackSummary(
                    id=r.id,
                    name=r.name,
                    rack_width_inches=r.rack_width_inches,
                    rack_units=r.rack_units,
                    rack_cols=r.rack_cols,
                    created_at=r.created_at,
                )
                for r in racks_data
            ],
            key=lambda s: (s.name.lower(), s.created_at, s.id),
        )

    def list_racks_filtered(
        self,
        session: SessionData,
        *,
        q: str | None,
        sort: str,
        order: str,
    ) -> list[RackSummary]:
        racks = self.list_racks(session)
        qn = (q or "").strip().lower()
        filtered = [s for s in racks if not qn or qn in s.name.lower()]
        rev = sort_order_reverse(order)
        sk = (sort or "name").lower()

        def sort_key(s: RackSummary) -> tuple[int, str, str]:
            if sk == "id":
                return (0, s.id.lower(), s.id)
            if sk == "created_at":
                return (0, s.created_at, s.id)
            return (0, s.name.lower(), s.id)

        filtered.sort(key=sort_key, reverse=rev)
        return filtered

    def get_rack(self, session: SessionData, rack_id: str) -> Rack:
        layout = get_layout(session)
        rack_data = read_rack(layout, rack_id)
        if rack_data is None:
            raise NotFoundError(f"Rack {rack_id} not found")
        return _rack_data_to_rack(rack_data)

    def get_layout(self, session: SessionData, rack_id: str) -> RackLayout:
        rack = self.get_rack(session, rack_id)
        all_hosts = host_manager.list_hosts(session)
        layout_hosts: list[RackLayoutHost] = []
        for h in all_hosts:
            if not h.placement or h.placement.rack != rack_id:
                continue
            p = h.placement
            layout_hosts.append(
                RackLayoutHost(
                    id=h.id,
                    hostname=h.hostname,
                    name=h.name,
                    ip_address=h.ip_address,
                    ssh_user=h.ssh_user,
                    ssh_port=h.ssh_port,
                    managed=h.managed,
                    groups=h.groups,
                    labels=h.labels,
                    os_family=h.os_family,
                    mac_address=h.mac_address,
                    subnet=h.subnet,
                    vars=h.vars,
                    placement="rack",
                    position_u_start=p.u_start,
                    position_u_height=p.u_height,
                    position_col_start=p.col_start,
                    position_col_count=p.col_count,
                )
            )
        return RackLayout(**rack.model_dump(), hosts=layout_hosts)

    def create_rack(self, session: SessionData, data: RackCreate) -> Rack:
        layout = get_layout(session)
        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")
        existing_ids = {r.id for r in read_racks(layout)}
        rack_id = generate_unique_id("rack", lambda c: c in existing_ids)
        now = now_iso()
        rack_data = RackData(
            id=rack_id,
            name=data.name.strip(),
            rack_units=data.rack_units,
            rack_width_inches=data.rack_width_inches,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
        )
        try:
            write_rack(layout, rack_data)
        except FileNotFoundError as exc:
            raise AlreadyExistsError(str(exc)) from exc
        logger.info("rack_created", rack_id=rack_id)
        return _rack_data_to_rack(rack_data)

    def update_rack(self, session: SessionData, rack_id: str, data: RackUpdate) -> Rack:
        layout = get_layout(session)
        rack = self.get_rack(session, rack_id)
        name = (data.name.strip() or rack.name) if data.name is not None else rack.name
        width = data.rack_width_inches if data.rack_width_inches is not None else rack.rack_width_inches
        units = data.rack_units if data.rack_units is not None else rack.rack_units
        cols_val = data.rack_cols if data.rack_cols is not None else rack.rack_cols
        if data.rack_width_inches is not None:
            validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(width, cols_val)
        updated = Rack(
            id=rack.id,
            name=name,
            rack_width_inches=width,
            rack_units=units,
            rack_cols=rack_cols,
            created_at=rack.created_at,
            updated_at=now_iso(),
        )
        write_rack(
            layout,
            RackData(
                id=updated.id,
                name=updated.name,
                rack_units=updated.rack_units,
                rack_width_inches=updated.rack_width_inches,
                rack_cols=updated.rack_cols,
                created_at=updated.created_at,
                updated_at=updated.updated_at,
            ),
        )
        logger.info("rack_updated", rack_id=rack_id)
        return updated

    def delete_rack(self, session: SessionData, rack_id: str) -> None:
        layout = get_layout(session)
        if read_rack(layout, rack_id) is None:
            raise NotFoundError(f"Rack {rack_id} not found")
        remove_rack(layout, rack_id)
        logger.info("rack_removed", rack_id=rack_id)

    def unassign_all_hosts(self, session: SessionData, rack_id: str) -> None:
        self.get_rack(session, rack_id)
        for h in host_manager.list_hosts(session):
            if h.placement and h.placement.rack == rack_id:
                host_manager.update_host(session, h.id, HostUpdate(placement=None))
        logger.info("rack_hosts_unassigned", rack_id=rack_id)

    def has_rack_for_session(self, session: SessionData) -> bool:
        return self.has_ready_rack_for_session(session)

    def has_any_rack_for_session(self, session: SessionData) -> bool:
        try:
            return len(self.list_racks(session)) > 0
        except FileNotFoundError:
            return False

    def has_ready_rack_for_session(self, session: SessionData) -> bool:
        try:
            layouts = [
                self.get_layout(session, s.id)
                for s in self.list_racks(session)
            ]
        except FileNotFoundError:
            return False
        return any(len(layout.hosts) > 0 for layout in layouts)


rack_manager = RackManager()
