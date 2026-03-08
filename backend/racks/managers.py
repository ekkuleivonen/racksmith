"""Rack business logic backed by the active local repo."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from pathlib import Path

import yaml

from nodes.managers import node_manager
from racks.misc import cols_for_width, validate_width
from racks.schemas import Rack, RackCreate, RackLayout, RackSummary, RackUpdate
from repos.managers import repos_manager

RACKS_DIR = Path(".racksmith/racks")
RACK_FILE_EXTENSIONS = (".yml", ".yaml")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _generate_rack_id(repo_path: Path) -> str:
    for _ in range(100):
        candidate = f"r_{secrets.token_hex(3)}"
        if not (repo_path / RACKS_DIR / f"{candidate}.yaml").exists():
            return candidate
    raise RuntimeError("Failed to generate unique rack ID")


class RackManager:
    """All rack operations for the active local repo."""

    def _rack_dir(self, repo_path: Path) -> Path:
        return repo_path / RACKS_DIR

    def _rack_file(self, repo_path: Path, rack_id: str) -> Path:
        return self._rack_dir(repo_path) / f"{rack_id}.yaml"

    def _iter_rack_files(self, repo_path: Path) -> list[Path]:
        rack_dir = self._rack_dir(repo_path)
        if not rack_dir.is_dir():
            return []
        files: list[Path] = []
        for ext in RACK_FILE_EXTENSIONS:
            files.extend(sorted(rack_dir.glob(f"*{ext}")))
        return files

    def _rack_from_yaml(self, rack_id: str, data: dict) -> Rack:
        return Rack(
            id=rack_id,
            name=data.get("name", ""),
            rack_width_inches=data.get("rack_width_inches", 19),
            rack_units=data.get("rack_units", 12),
            rack_cols=data.get("rack_cols", 12),
            created_at=data.get("created_at", _now_iso()),
            updated_at=data.get("updated_at", _now_iso()),
        )

    def list_racks(self, session) -> list[RackSummary]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        summaries: list[RackSummary] = []
        for path in self._iter_rack_files(repo_path):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                rack_id = data.get("id") or path.stem
                rack = self._rack_from_yaml(rack_id, data or {})
                summaries.append(
                    RackSummary(
                        id=rack.id,
                        name=rack.name,
                        rack_width_inches=rack.rack_width_inches,
                        rack_units=rack.rack_units,
                        rack_cols=rack.rack_cols,
                        created_at=rack.created_at,
                    )
                )
            except (OSError, yaml.YAMLError):
                continue
        return sorted(summaries, key=lambda r: (r.name.lower(), r.created_at, r.id))

    def get_rack(self, session, rack_id: str) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        path = self._rack_file(repo_path, rack_id)
        if not path.is_file():
            raise KeyError(f"Rack {rack_id} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        rid = data.get("id") or path.stem
        return self._rack_from_yaml(rid, data or {})

    def get_layout(self, session, rack_id: str) -> RackLayout:
        rack = self.get_rack(session, rack_id)
        all_nodes = node_manager.list_nodes(session)
        nodes_in_rack = [
            n for n in all_nodes
            if n.placement and n.placement.rack == rack_id
        ]
        return RackLayout(**rack.model_dump(), nodes=nodes_in_rack)

    def create_rack(self, session, data: RackCreate) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")

        rack_id = _generate_rack_id(repo_path)
        now = _now_iso()
        rack = Rack(
            id=rack_id,
            name=data.name.strip(),
            rack_width_inches=data.rack_width_inches,
            rack_units=data.rack_units,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
        )
        rack_dir = self._rack_dir(repo_path)
        rack_dir.mkdir(parents=True, exist_ok=True)
        self._rack_file(repo_path, rack_id).write_text(
            yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8"
        )
        return rack

    def update_rack(self, session, rack_id: str, data: RackUpdate) -> Rack:
        repo_path = repos_manager.active_repo_path(session)
        rack = self.get_rack(session, rack_id)
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
        rack.updated_at = _now_iso()
        self._rack_file(repo_path, rack_id).write_text(
            yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8"
        )
        return rack

    def delete_rack(self, session, rack_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._rack_file(repo_path, rack_id)
        if not path.is_file():
            raise KeyError(f"Rack {rack_id} not found")
        path.unlink(missing_ok=True)

    def has_rack_for_session(self, session) -> bool:
        return self.has_ready_rack_for_session(session)

    def has_any_rack_for_session(self, session) -> bool:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except FileNotFoundError:
            return False
        return any(True for _ in self._iter_rack_files(repo_path))

    def has_ready_rack_for_session(self, session) -> bool:
        try:
            layouts = [
                self.get_layout(session, s.id)
                for s in self.list_racks(session)
            ]
        except FileNotFoundError:
            return False
        return any(len(layout.nodes) > 0 for layout in layouts)


rack_manager = RackManager()
