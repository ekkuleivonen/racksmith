"""Rack business logic backed by ansible/racks.py."""

from __future__ import annotations

from datetime import UTC, datetime

from _utils.logging import get_logger
from ansible import resolve_layout

logger = get_logger(__name__)
from github.misc import RepoNotAvailableError
from ansible.racks import RackData, read_rack, read_racks, remove_rack, write_rack

from hosts.managers import host_manager
from racks.misc import cols_for_width, validate_width
from racks.schemas import Rack, RackCreate, RackLayout, RackSummary, RackUpdate
from repos.managers import repos_manager


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


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

    def list_racks(self, session) -> list[RackSummary]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
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

    def get_rack(self, session, rack_id: str) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        rack_data = read_rack(layout, rack_id)
        if rack_data is None:
            raise KeyError(f"Rack {rack_id} not found")
        return _rack_data_to_rack(rack_data)

    def get_layout(self, session, rack_id: str) -> RackLayout:
        rack = self.get_rack(session, rack_id)
        all_hosts = host_manager.list_hosts(session)
        from hosts.schemas import Host

        hosts_in_rack = [
            Host(
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
                notes=h.notes,
                placement=h.placement,
                mac_address=h.mac_address,
            )
            for h in all_hosts
            if h.placement and h.placement.rack == rack_id
        ]
        return RackLayout(**rack.model_dump(), hosts=hosts_in_rack)

    def create_rack(self, session, data: RackCreate) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")
        import secrets

        existing_ids = {r.id for r in read_racks(layout)}
        for _ in range(100):
            rack_id = f"r_{secrets.token_hex(3)}"
            if rack_id not in existing_ids:
                break
        else:
            raise RuntimeError("Failed to generate unique rack ID")
        now = _now_iso()
        rack_data = RackData(
            id=rack_id,
            name=data.name.strip(),
            rack_units=data.rack_units,
            rack_width_inches=data.rack_width_inches,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
        )
        write_rack(layout, rack_data)
        logger.info("rack_created", rack_id=rack_id)
        return _rack_data_to_rack(rack_data)

    def update_rack(self, session, rack_id: str, data: RackUpdate) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
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
            updated_at=_now_iso(),
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

    def delete_rack(self, session, rack_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        if read_rack(layout, rack_id) is None:
            raise KeyError(f"Rack {rack_id} not found")
        remove_rack(layout, rack_id)
        logger.info("rack_removed", rack_id=rack_id)

    def has_rack_for_session(self, session) -> bool:
        return self.has_ready_rack_for_session(session)

    def has_any_rack_for_session(self, session) -> bool:
        try:
            return len(self.list_racks(session)) > 0
        except FileNotFoundError:
            return False

    def has_ready_rack_for_session(self, session) -> bool:
        try:
            layouts = [
                self.get_layout(session, s.id)
                for s in self.list_racks(session)
            ]
        except FileNotFoundError:
            return False
        return any(len(layout.hosts) > 0 for layout in layouts)


rack_manager = RackManager()
