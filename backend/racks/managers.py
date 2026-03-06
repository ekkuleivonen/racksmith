"""Rack business logic: CRUD backed by Redis, sync delegated to github module."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from _utils.redis import Redis
from github.managers import repo_manager
from racks.misc import (
    cols_for_width,
    validate_ip,
    validate_item_cols,
    validate_item_position,
    validate_width,
)
from racks.schemas import (
    Rack,
    RackCreate,
    RackItem,
    RackItemInput,
    RackSummary,
    RackUpdate,
)

_KEY_PREFIX = "racksmith:rack"
_INDEX_PREFIX = "racksmith:racks"


def _rack_key(owner: str, rack_id: str) -> str:
    return f"{_KEY_PREFIX}:{owner}:{rack_id}"


def _index_key(owner: str) -> str:
    return f"{_INDEX_PREFIX}:{owner}"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class RackManager:
    """All rack operations — pure business logic, no HTTP concerns."""

    # -- persistence ----------------------------------------------------------

    def _load(self, owner: str, rack_id: str) -> Rack:
        raw = Redis.get(_rack_key(owner, rack_id))
        if not raw:
            raise KeyError(f"Rack {rack_id} not found")
        return Rack.model_validate_json(raw)

    def _save(self, owner: str, rack: Rack) -> None:
        Redis.set(_rack_key(owner, rack.id), rack.model_dump_json())
        Redis.sadd(_index_key(owner), rack.id)

    def _delete(self, owner: str, rack_id: str) -> None:
        Redis.delete(_rack_key(owner, rack_id))
        Redis.srem(_index_key(owner), rack_id)

    # -- rack CRUD ------------------------------------------------------------

    def list_racks(self, owner: str) -> list[RackSummary]:
        rack_ids = Redis.smembers(_index_key(owner))
        summaries: list[RackSummary] = []
        for rid in sorted(rack_ids):
            try:
                rack = self._load(owner, rid)
            except KeyError:
                Redis.srem(_index_key(owner), rid)
                continue
            summaries.append(
                RackSummary(
                    id=rack.id,
                    name=rack.name,
                    rack_width_inches=rack.rack_width_inches,
                    rack_units=rack.rack_units,
                    rack_cols=rack.rack_cols,
                    item_count=len(rack.items),
                    created_at=rack.created_at,
                    synced_at=rack.synced_at,
                    github_repo=rack.github_repo,
                )
            )
        summaries.sort(key=lambda s: s.created_at, reverse=True)
        return summaries

    def create_rack(self, owner: str, data: RackCreate) -> Rack:
        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")

        items: list[RackItem] = []
        for inp in data.items:
            validate_item_position(
                data.rack_units,
                u_start=inp.position_u_start,
                u_height=inp.position_u_height,
            )
            validate_item_cols(
                rack_cols,
                col_start=inp.position_col_start,
                col_count=inp.position_col_count,
            )
            ip = validate_ip(has_no_ip=inp.has_no_ip, ip_value=inp.ip_address)
            items.append(
                RackItem(
                    id=_new_id(),
                    name=inp.name.strip() if inp.name else None,
                    position_u_start=inp.position_u_start,
                    position_u_height=inp.position_u_height,
                    position_col_start=inp.position_col_start,
                    position_col_count=inp.position_col_count,
                    has_no_ip=inp.has_no_ip,
                    ip_address=ip,
                )
            )

        now = _now_iso()
        rack = Rack(
            id=_new_id(),
            name=data.name.strip(),
            owner_login=owner,
            rack_width_inches=data.rack_width_inches,
            rack_units=data.rack_units,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
            items=items,
        )
        self._save(owner, rack)
        return rack

    def get_rack(self, owner: str, rack_id: str) -> Rack:
        return self._load(owner, rack_id)

    def update_rack(self, owner: str, rack_id: str, data: RackUpdate) -> Rack:
        rack = self._load(owner, rack_id)
        if data.name is not None:
            rack.name = data.name.strip()
        if data.rack_units is not None:
            rack.rack_units = data.rack_units
        if data.rack_cols is not None:
            rack.rack_cols = data.rack_cols
        rack.updated_at = _now_iso()
        self._save(owner, rack)
        return rack

    def delete_rack(self, owner: str, rack_id: str) -> None:
        self._load(owner, rack_id)
        self._delete(owner, rack_id)

    # -- item CRUD ------------------------------------------------------------

    def add_item(self, owner: str, rack_id: str, data: RackItemInput) -> RackItem:
        rack = self._load(owner, rack_id)
        validate_item_position(
            rack.rack_units,
            u_start=data.position_u_start,
            u_height=data.position_u_height,
        )
        validate_item_cols(
            rack.rack_cols,
            col_start=data.position_col_start,
            col_count=data.position_col_count,
        )
        ip = validate_ip(has_no_ip=data.has_no_ip, ip_value=data.ip_address)
        item = RackItem(
            id=_new_id(),
            name=data.name.strip() if data.name else None,
            position_u_start=data.position_u_start,
            position_u_height=data.position_u_height,
            position_col_start=data.position_col_start,
            position_col_count=data.position_col_count,
            has_no_ip=data.has_no_ip,
            ip_address=ip,
        )
        rack.items.append(item)
        rack.updated_at = _now_iso()
        self._save(owner, rack)
        return item

    def update_item(
        self, owner: str, rack_id: str, item_id: str, data: RackItemInput
    ) -> RackItem:
        rack = self._load(owner, rack_id)
        validate_item_position(
            rack.rack_units,
            u_start=data.position_u_start,
            u_height=data.position_u_height,
        )
        validate_item_cols(
            rack.rack_cols,
            col_start=data.position_col_start,
            col_count=data.position_col_count,
        )
        ip = validate_ip(has_no_ip=data.has_no_ip, ip_value=data.ip_address)
        for idx, item in enumerate(rack.items):
            if item.id == item_id:
                rack.items[idx] = RackItem(
                    id=item_id,
                    name=data.name.strip() if data.name else None,
                    position_u_start=data.position_u_start,
                    position_u_height=data.position_u_height,
                    position_col_start=data.position_col_start,
                    position_col_count=data.position_col_count,
                    has_no_ip=data.has_no_ip,
                    ip_address=ip,
                )
                rack.updated_at = _now_iso()
                self._save(owner, rack)
                return rack.items[idx]
        raise KeyError(f"Item {item_id} not found")

    def remove_item(self, owner: str, rack_id: str, item_id: str) -> None:
        rack = self._load(owner, rack_id)
        before = len(rack.items)
        rack.items = [i for i in rack.items if i.id != item_id]
        if len(rack.items) == before:
            raise KeyError(f"Item {item_id} not found")
        rack.updated_at = _now_iso()
        self._save(owner, rack)

    # -- GitHub sync (delegated) ----------------------------------------------

    def _rack_state_json(self, rack: Rack) -> str:
        state = {
            "kind": "racksmith/rack",
            "schema_version": 1,
            "meta": {
                "name": rack.name,
                "rack_width_inches": rack.rack_width_inches,
                "rack_units": rack.rack_units,
                "rack_cols": rack.rack_cols,
                "owner_login": rack.owner_login,
                "created_at": rack.created_at,
            },
            "items": [item.model_dump() for item in rack.items],
        }
        return json.dumps(state, indent=2) + "\n"

    async def sync_to_remote(
        self, owner: str, rack_id: str, access_token: str
    ) -> dict:
        rack = self._load(owner, rack_id)
        result = await repo_manager.sync_rack(
            rack_state_json=self._rack_state_json(rack),
            rack_name=rack.name,
            github_repo=rack.github_repo,
            owner=owner,
            access_token=access_token,
        )
        rack.github_repo = result.get("github_repo", rack.github_repo)
        rack.synced_at = _now_iso()
        self._save(owner, rack)
        return result


rack_manager = RackManager()
