"""Rack business logic backed by the active local repo."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

import yaml

from nodes.managers import node_manager
from racks.misc import cols_for_width, validate_width
from racks.schemas import Rack, RackCreate, RackLayout, RackSummary, RackUpdate
from setup.managers import setup_manager

RACKS_DIR = Path(".racksmith/racks")
RACK_FILE_EXTENSIONS = (".yml", ".yaml")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "rack"


class RackManager:
    """All rack operations for the active local repo."""

    def _rack_dir(self, repo_path: Path) -> Path:
        return repo_path / RACKS_DIR

    def _rack_file(self, repo_path: Path, slug: str) -> Path:
        return self._rack_dir(repo_path) / f"{slug}.yaml"

    def _iter_rack_files(self, repo_path: Path) -> list[Path]:
        rack_dir = self._rack_dir(repo_path)
        if not rack_dir.is_dir():
            return []
        files: list[Path] = []
        for ext in RACK_FILE_EXTENSIONS:
            files.extend(sorted(rack_dir.glob(f"*{ext}")))
        return files

    def _rack_from_yaml(self, slug: str, data: dict) -> Rack:
        return Rack(
            slug=slug,
            name=data.get("name", ""),
            rack_width_inches=data.get("rack_width_inches", 19),
            rack_units=data.get("rack_units", 12),
            rack_cols=data.get("rack_cols", 12),
            created_at=data.get("created_at", _now_iso()),
            updated_at=data.get("updated_at", _now_iso()),
        )

    def _next_slug(self, repo_path: Path, base: str) -> str:
        candidate = base
        suffix = 2
        while self._rack_file(repo_path, candidate).exists():
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate

    def list_racks(self, session) -> list[RackSummary]:
        try:
            repo_path = setup_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        summaries: list[RackSummary] = []
        for path in self._iter_rack_files(repo_path):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                slug = data.get("slug") or path.stem
                rack = self._rack_from_yaml(slug, data or {})
                summaries.append(
                    RackSummary(
                        slug=rack.slug,
                        name=rack.name,
                        rack_width_inches=rack.rack_width_inches,
                        rack_units=rack.rack_units,
                        rack_cols=rack.rack_cols,
                        created_at=rack.created_at,
                    )
                )
            except (OSError, yaml.YAMLError):
                continue
        return sorted(summaries, key=lambda r: (r.name.lower(), r.created_at, r.slug))

    def get_rack(self, session, slug: str) -> Rack:
        repo_path = setup_manager.active_repo_path(session)
        path = self._rack_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Rack {slug} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        slug_val = data.get("slug") or path.stem
        return self._rack_from_yaml(slug_val, data or {})

    def get_layout(self, session, slug: str) -> RackLayout:
        rack = self.get_rack(session, slug)
        all_nodes = node_manager.list_nodes(session)
        nodes_in_rack = [
            n for n in all_nodes
            if n.placement and n.placement.rack == slug
        ]
        return RackLayout(**rack.model_dump(), nodes=nodes_in_rack)

    def create_rack(self, session, data: RackCreate) -> Rack:
        repo_path = setup_manager.active_repo_path(session)
        validate_width(data.rack_width_inches)
        rack_cols = cols_for_width(data.rack_width_inches, data.rack_cols)
        if rack_cols < 1 or rack_cols > 48:
            raise ValueError("rack_cols must be between 1 and 48")

        base_slug = _slugify(data.name) or "rack"
        slug = self._next_slug(repo_path, base_slug)
        now = _now_iso()
        rack = Rack(
            slug=slug,
            name=data.name.strip(),
            rack_width_inches=data.rack_width_inches,
            rack_units=data.rack_units,
            rack_cols=rack_cols,
            created_at=now,
            updated_at=now,
        )
        rack_dir = self._rack_dir(repo_path)
        rack_dir.mkdir(parents=True, exist_ok=True)
        self._rack_file(repo_path, slug).write_text(
            yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8"
        )
        return rack

    def update_rack(self, session, slug: str, data: RackUpdate) -> Rack:
        repo_path = setup_manager.active_repo_path(session)
        rack = self.get_rack(session, slug)
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
        self._rack_file(repo_path, slug).write_text(
            yaml.safe_dump(rack.model_dump(), sort_keys=False), encoding="utf-8"
        )
        return rack

    def delete_rack(self, session, slug: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        path = self._rack_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Rack {slug} not found")
        path.unlink(missing_ok=True)

    def has_rack_for_session(self, session) -> bool:
        return self.has_ready_rack_for_session(session)

    def has_any_rack_for_session(self, session) -> bool:
        try:
            repo_path = setup_manager.active_repo_path(session)
        except FileNotFoundError:
            return False
        return any(True for _ in self._iter_rack_files(repo_path))

    def has_ready_rack_for_session(self, session) -> bool:
        try:
            layouts = [
                self.get_layout(session, s.slug)
                for s in self.list_racks(session)
            ]
        except FileNotFoundError:
            return False
        return any(len(layout.nodes) > 0 for layout in layouts)


rack_manager = RackManager()
