"""Rack business logic backed by the active local repo."""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

import yaml

from racks.misc import (
    cols_for_width,
    validate_host,
    validate_item_cols,
    validate_item_position,
    validate_width,
)
from racks.schemas import (
    Rack,
    RackCreate,
    RackItem,
    RackItemInput,
    RackItemPreviewRequest,
    RackSummary,
    RackUpdate,
)
from setup.managers import setup_manager
from ssh.misc import probe_ssh_target

LEGACY_RACK_FILE = Path(".racksmith/rack.json")
RACKS_DIR = Path(".racksmith/racks")
ANSIBLE_INVENTORY_DIR = Path("ansible_scripts/inventory")
RACK_FILE_EXTENSIONS = (".yml", ".yaml", ".json")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class RackManager:
    """All rack operations for the active local repo."""

    def _park_all_items(self, rack: Rack) -> None:
        for item in rack.items:
            item.placement = "parked"

    def _ansible_inventory_dir(self, repo_path: Path) -> Path:
        return repo_path / ANSIBLE_INVENTORY_DIR

    def _inventory_file(self, repo_path: Path, rack_id: str) -> Path:
        return self._ansible_inventory_dir(repo_path) / f"rack_{rack_id}.yml"

    def _inventory_safe_name(self, value: str, *, fallback: str) -> str:
        cleaned = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
        cleaned = cleaned.strip("_")
        return cleaned or fallback

    def _inventory_host_key(self, item: RackItem) -> str:
        base_name = item.name or item.id
        return self._inventory_safe_name(base_name, fallback=f"item_{item.id}")

    def _inventory_unique_host_key(
        self, item: RackItem, existing_hosts: dict[str, dict]
    ) -> str:
        host_key = self._inventory_host_key(item)
        if host_key not in existing_hosts:
            return host_key
        return f"{host_key}_{item.id}"

    def _inventory_labels(self, item: RackItem) -> list[str]:
        return item.tags

    def _inventory_host_vars(self, item: RackItem) -> dict[str, object]:
        host_vars: dict[str, object] = {
            "ansible_host": item.host,
            "ansible_user": item.ssh_user,
            "ansible_port": item.ssh_port,
        }
        if item.os:
            host_vars["os"] = item.os
        if item.tags:
            host_vars["labels"] = self._inventory_labels(item)
        return host_vars

    def _inventory_group_name(self, prefix: str, value: str, *, fallback: str) -> str:
        return f"{prefix}_{self._inventory_safe_name(value, fallback=fallback)}"

    def _inventory_group_members(self, rack: Rack) -> tuple[dict[str, dict], dict[str, dict]]:
        hosts: dict[str, dict] = {}
        groups: dict[str, dict] = {
            self._inventory_group_name("rack", rack.name, fallback=rack.id): {"hosts": {}}
        }
        rack_group = next(iter(groups))

        for item in rack.items:
            if not item.managed or not item.host or not item.ssh_user:
                continue

            host_key = self._inventory_unique_host_key(item, hosts)
            hosts[host_key] = self._inventory_host_vars(item)
            groups[rack_group]["hosts"][host_key] = {}

        return hosts, groups

    def _sync_ansible_inventory(self, repo_path: Path, rack: Rack) -> None:
        hosts, groups = self._inventory_group_members(rack)
        inventory = {"all": {"hosts": hosts, "children": groups}}
        inventory_file = self._inventory_file(repo_path, rack.id)
        inventory_file.parent.mkdir(parents=True, exist_ok=True)
        inventory_file.write_text(
            yaml.safe_dump(inventory, sort_keys=False), encoding="utf-8"
        )

    def _delete_ansible_inventory(self, repo_path: Path, rack_id: str) -> None:
        self._inventory_file(repo_path, rack_id).unlink(missing_ok=True)

    def _rack_dir(self, repo_path: Path) -> Path:
        return repo_path / RACKS_DIR

    def _rack_file(self, repo_path: Path, rack_id: str) -> Path:
        return self._rack_dir(repo_path) / f"{rack_id}.yml"

    def _legacy_rack_file(self, repo_path: Path) -> Path:
        return repo_path / LEGACY_RACK_FILE

    def has_rack_for_session(self, session) -> bool:
        return self.has_ready_rack_for_session(session)

    def has_any_rack_for_session(self, session) -> bool:
        try:
            repo_path = setup_manager.active_repo_path(session)
        except FileNotFoundError:
            return False
        return any(True for _ in self._iter_rack_records(repo_path))

    def has_ready_rack_for_session(self, session) -> bool:
        try:
            repo_path = setup_manager.active_repo_path(session)
        except FileNotFoundError:
            return False
        return any(len(rack.items) > 0 for _, rack in self._iter_rack_records(repo_path))

    def _iter_rack_files(self, repo_path: Path) -> list[Path]:
        rack_files: list[Path] = []
        rack_dir = self._rack_dir(repo_path)
        if rack_dir.is_dir():
            for extension in RACK_FILE_EXTENSIONS:
                rack_files.extend(sorted(rack_dir.glob(f"*{extension}")))
        legacy_file = self._legacy_rack_file(repo_path)
        if legacy_file.is_file():
            rack_files.append(legacy_file)
        return rack_files

    def _iter_rack_records(self, repo_path: Path) -> list[tuple[Path, Rack]]:
        records: list[tuple[Path, Rack]] = []
        for rack_file in self._iter_rack_files(repo_path):
            payload = yaml.safe_load(rack_file.read_text(encoding="utf-8"))
            records.append(
                (
                    rack_file,
                    Rack.model_validate(payload),
                )
            )
        return records

    def _save_to_repo(self, repo_path: Path, rack: Rack) -> None:
        rack_file = self._rack_file(repo_path, rack.id)
        rack_file.parent.mkdir(parents=True, exist_ok=True)
        rack_file.write_text(yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8")
        self._sync_ansible_inventory(repo_path, rack)

    def _load_for_session(self, session, rack_id: str) -> tuple[Path, Path, Rack]:
        repo_path = setup_manager.active_repo_path(session)
        for rack_file, rack in self._iter_rack_records(repo_path):
            if rack.id == rack_id:
                return repo_path, rack_file, rack
        raise KeyError("Rack not found")

    def list_racks(self, session) -> list[RackSummary]:
        try:
            repo_path = setup_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        summaries = [
            RackSummary(
                id=rack.id,
                name=rack.name,
                rack_width_inches=rack.rack_width_inches,
                rack_units=rack.rack_units,
                rack_cols=rack.rack_cols,
                item_count=len(rack.items),
                created_at=rack.created_at,
            )
            for _, rack in self._iter_rack_records(repo_path)
        ]
        return sorted(summaries, key=lambda rack: (rack.name.lower(), rack.created_at, rack.id))

    async def create_rack(self, session, data: RackCreate) -> Rack:
        repo_path = setup_manager.active_repo_path(session)

        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")

        items = await asyncio.gather(
            *[
                self._build_item(_new_id(), data.rack_units, rack_cols, inp)
                for inp in data.items
            ]
        )
        now = _now_iso()
        rack = Rack(
            id=_new_id(),
            name=data.name.strip(),
            rack_width_inches=data.rack_width_inches,
            rack_units=data.rack_units,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
            items=items,
        )
        self._save_to_repo(repo_path, rack)
        return rack

    def get_rack(self, session, rack_id: str) -> Rack:
        _, _, rack = self._load_for_session(session, rack_id)
        return rack

    def update_rack(self, session, rack_id: str, data: RackUpdate) -> Rack:
        repo_path, rack_file, rack = self._load_for_session(session, rack_id)
        previous_width = rack.rack_width_inches
        previous_units = rack.rack_units
        previous_cols = rack.rack_cols
        if data.name:
            rack.name = data.name.strip()
        if data.rack_width_inches > 0:
            validate_width(data.rack_width_inches)
            rack.rack_width_inches = data.rack_width_inches
        if data.rack_units > 0:
            rack.rack_units = data.rack_units
        if data.rack_cols > 0:
            rack.rack_cols = data.rack_cols
        rack.rack_cols = cols_for_width(rack.rack_width_inches, rack.rack_cols)
        dimensions_changed = (
            rack.rack_width_inches != previous_width
            or rack.rack_units != previous_units
            or rack.rack_cols != previous_cols
        )
        if data.park_all_items or dimensions_changed:
            self._park_all_items(rack)
        rack.updated_at = _now_iso()
        self._save_loaded_rack(repo_path, rack_file, rack)
        return rack

    def delete_rack(self, session, rack_id: str) -> None:
        repo_path, rack_file, _ = self._load_for_session(session, rack_id)
        rack_file.unlink(missing_ok=True)
        self._delete_ansible_inventory(repo_path, rack_id)

    def _save_loaded_rack(self, repo_path: Path, rack_file: Path, rack: Rack) -> None:
        # Migrate legacy rack storage into the multi-rack directory on next write.
        if rack_file == self._legacy_rack_file(repo_path):
            self._save_to_repo(repo_path, rack)
            rack_file.unlink(missing_ok=True)
            return
        target_file = self._rack_file(repo_path, rack.id)
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text(
            yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8"
        )
        if rack_file != target_file:
            rack_file.unlink(missing_ok=True)
        self._sync_ansible_inventory(repo_path, rack)

    async def _build_item(
        self,
        item_id: str,
        rack_units: int,
        rack_cols: int,
        data: RackItemInput,
        existing: RackItem | None = None,
        *,
        force_probe: bool = False,
    ) -> RackItem:
        host = validate_host(data.host)
        ssh_user = data.ssh_user.strip()

        fields = data.model_dump()
        fields["id"] = item_id
        fields["host"] = host
        fields["ssh_user"] = ssh_user

        if not data.managed:
            fields["host"] = ""
            fields["ssh_user"] = ""
            fields["ssh_port"] = 22
            fields["mac_address"] = ""
            fields["os"] = ""
            fields["tags"] = data.tags
            fields["name"] = data.name.strip() or (existing.name if existing else "")
            return RackItem.model_validate(fields)

        if data.placement == "rack":
            validate_item_position(
                rack_units,
                u_start=data.position_u_start,
                u_height=data.position_u_height,
            )
            validate_item_cols(
                rack_cols,
                col_start=data.position_col_start,
                col_count=data.position_col_count,
            )

        if data.placement == "parked":
            fields["name"] = data.name.strip() or (existing.name if existing else "")
            fields["mac_address"] = existing.mac_address if existing else ""
            fields["os"] = data.os or (existing.os if existing else "")
            fields["tags"] = data.tags
            return RackItem.model_validate(fields)

        if not host and not ssh_user:
            fields["name"] = data.name.strip() or (existing.name if existing else "")
            fields["mac_address"] = existing.mac_address if existing else ""
            fields["os"] = data.os or (existing.os if existing else "")
            fields["tags"] = data.tags
            return RackItem.model_validate(fields)

        if not host:
            raise ValueError("Host is required when SSH user is set")
        if not ssh_user:
            raise ValueError("SSH user is required when host is set")

        if (
            not force_probe
            and existing
            and existing.host == host
            and existing.ssh_user == ssh_user
            and existing.ssh_port == data.ssh_port
            and existing.os
            and existing.mac_address
        ):
            fields["host"] = existing.host
            fields["name"] = data.name.strip() or existing.name
            fields["mac_address"] = existing.mac_address
            fields["os"] = data.os or existing.os
            fields["tags"] = data.tags
            return RackItem.model_validate(fields)

        probe = await probe_ssh_target(host, ssh_user, data.ssh_port)
        fields["host"] = probe.host
        fields["name"] = data.name.strip() or probe.name
        fields["mac_address"] = probe.mac_address
        fields["os"] = probe.os
        fields["tags"] = data.tags or probe.tags
        return RackItem.model_validate(fields)

    async def add_item(self, session, rack_id: str, data: RackItemInput) -> RackItem:
        repo_path, rack_file, rack = self._load_for_session(session, rack_id)
        item = await self._build_item(_new_id(), rack.rack_units, rack.rack_cols, data)
        rack.items.append(item)
        rack.updated_at = _now_iso()
        self._save_loaded_rack(repo_path, rack_file, rack)
        return item

    async def preview_item(self, data: RackItemPreviewRequest) -> RackItem:
        item_data = RackItemInput.model_validate(
            data.model_dump(exclude={"item_id", "rack_units", "rack_cols"})
        )
        return await self._build_item(
            data.item_id,
            data.rack_units,
            data.rack_cols,
            item_data,
        )

    async def update_item(self, session, rack_id: str, item_id: str, data: RackItemInput) -> RackItem:
        repo_path, rack_file, rack = self._load_for_session(session, rack_id)
        for idx, item in enumerate(rack.items):
            if item.id == item_id:
                updated = await self._build_item(
                    item_id, rack.rack_units, rack.rack_cols, data, existing=item
                )
                rack.items[idx] = updated
                rack.updated_at = _now_iso()
                self._save_loaded_rack(repo_path, rack_file, rack)
                return updated
        raise KeyError(f"Item {item_id} not found")

    async def rediscover_item(self, session, rack_id: str, item_id: str) -> RackItem:
        repo_path, rack_file, rack = self._load_for_session(session, rack_id)
        for idx, item in enumerate(rack.items):
            if item.id != item_id:
                continue
            data = RackItemInput.model_validate(item.model_dump(exclude={"id", "mac_address"}))
            refreshed = await self._build_item(
                item_id,
                rack.rack_units,
                rack.rack_cols,
                data,
                existing=item,
                force_probe=True,
            )
            rack.items[idx] = refreshed
            rack.updated_at = _now_iso()
            self._save_loaded_rack(repo_path, rack_file, rack)
            return refreshed
        raise KeyError(f"Item {item_id} not found")

    def remove_item(self, session, rack_id: str, item_id: str) -> None:
        repo_path, rack_file, rack = self._load_for_session(session, rack_id)
        before = len(rack.items)
        rack.items = [item for item in rack.items if item.id != item_id]
        if len(rack.items) == before:
            raise KeyError(f"Item {item_id} not found")
        rack.updated_at = _now_iso()
        self._save_loaded_rack(repo_path, rack_file, rack)


rack_manager = RackManager()
