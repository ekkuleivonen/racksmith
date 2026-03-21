"""Playbook I/O — read/write standard Ansible playbook YAML.

Racksmith metadata (description) is no longer embedded in play vars.
It lives in .racksmith.yml via racksmith_meta.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from _utils.logging import get_logger

from . import atomic_yaml_dump, validate_safe_id
from .config import AnsibleLayout
from .racksmith_meta import (
    get_playbook_meta,
    read_meta,
    remove_playbook_meta,
    set_playbook_meta,
    write_meta,
)

logger = get_logger(__name__)


@dataclass
class PlaybookRoleEntry:
    role: str
    vars: dict = field(default_factory=dict)


@dataclass
class PlaybookData:
    id: str
    path: Path
    name: str
    description: str = ""
    hosts: str = "all"
    gather_facts: bool = True
    become: bool = False
    roles: list[PlaybookRoleEntry] = field(default_factory=list)
    raw_content: str = ""
    registry_id: str = ""
    registry_version: int = 0
    folder: str = ""


def read_playbook(path: Path, repo_path: Path | None = None) -> PlaybookData:
    """Parse an Ansible playbook file. Description comes from .racksmith.yml, not play vars."""
    path = Path(path).resolve()
    raw = path.read_text(encoding="utf-8")
    payload = yaml.safe_load(raw)
    if not isinstance(payload, list) or not payload:
        raise ValueError("Playbook must be a YAML list with at least one play")
    play = payload[0]
    if not isinstance(play, dict):
        raise ValueError("First play must be a mapping")

    # Legacy: read description from play vars if present (for backwards compat during migration)
    description = ""
    vars_block = play.get("vars")
    if isinstance(vars_block, dict):
        desc_val = vars_block.get("racksmith_description")
        if isinstance(desc_val, str):
            description = desc_val

    role_entries: list[PlaybookRoleEntry] = []
    for entry in play.get("roles", []) or []:
        if isinstance(entry, str):
            role_entries.append(PlaybookRoleEntry(role=entry, vars={}))
        elif isinstance(entry, dict):
            r = entry.get("role", "")
            v = entry.get("vars", {}) or {}
            if not isinstance(v, dict):
                v = {}
            inline_vars = {
                k: val for k, val in entry.items()
                if k not in ("role", "vars")
            }
            merged_vars = {**inline_vars, **v}
            role_entries.append(PlaybookRoleEntry(role=str(r), vars=merged_vars))

    rel_path = path
    if repo_path:
        try:
            rel_path = path.relative_to(Path(repo_path).resolve())
        except ValueError:
            logger.debug("playbook_path_not_relative", path=str(path), repo_path=str(repo_path))
    return PlaybookData(
        id=path.stem,
        path=rel_path,
        name=str(play.get("name", path.stem)),
        description=description,
        hosts=str(play.get("hosts", "all")),
        gather_facts=play.get("gather_facts", True),
        become=play.get("become", False),
        roles=role_entries,
        raw_content=raw,
    )


def _overlay_playbook_meta(pb: PlaybookData, pb_meta: dict) -> None:
    """Overlay racksmith-specific metadata from .racksmith.yml onto a PlaybookData."""
    if pb_meta.get("description"):
        pb.description = pb_meta["description"]
    pb.registry_id = str(pb_meta.get("registry_id", ""))
    pb.registry_version = int(pb_meta.get("registry_version", 0))
    pb.folder = str(pb_meta.get("folder", ""))


def read_playbook_with_meta(
    path: Path, layout: AnsibleLayout,
) -> PlaybookData:
    """Read playbook and overlay racksmith metadata from .racksmith.yml."""
    pb = read_playbook(path, layout.repo_path)
    meta = read_meta(layout)
    pb_meta = get_playbook_meta(meta, pb.id)
    _overlay_playbook_meta(pb, pb_meta)
    return pb


def list_playbooks(layout: AnsibleLayout) -> list[PlaybookData]:
    """Scan playbooks_path/ for *.yml files, overlay racksmith meta."""
    playbooks_path = layout.playbooks_path
    if not playbooks_path.is_dir():
        return []
    meta = read_meta(layout)
    results: list[PlaybookData] = []
    for path in sorted(playbooks_path.glob("*.yml")):
        if path.is_file():
            try:
                pb = read_playbook(path, layout.repo_path)
                _overlay_playbook_meta(pb, get_playbook_meta(meta, pb.id))
                results.append(pb)
            except (OSError, ValueError, yaml.YAMLError):
                logger.warning("playbook_parse_failed", path=str(path), exc_info=True)
                continue
    for path in sorted(playbooks_path.glob("*.yaml")):
        if path.is_file() and not path.with_suffix(".yml").exists():
            try:
                pb = read_playbook(path, layout.repo_path)
                _overlay_playbook_meta(pb, get_playbook_meta(meta, pb.id))
                results.append(pb)
            except (OSError, ValueError, yaml.YAMLError):
                logger.warning("playbook_parse_failed", path=str(path), exc_info=True)
                continue
    return results


def write_playbook(layout: AnsibleLayout, playbook: PlaybookData) -> Path:
    """Serialize to standard Ansible playbook YAML. No racksmith keys in play vars."""
    validate_safe_id(playbook.id)
    layout.playbooks_path.mkdir(parents=True, exist_ok=True)
    path = layout.playbooks_path / f"{playbook.id}.yml"

    play: dict = {
        "name": playbook.name,
        "hosts": playbook.hosts,
        "gather_facts": playbook.gather_facts,
        "become": playbook.become,
        "roles": [],
    }

    for re in playbook.roles:
        if re.vars:
            play["roles"].append({"role": re.role, "vars": re.vars})
        else:
            play["roles"].append(re.role)

    atomic_yaml_dump([play], path)

    meta = read_meta(layout)
    existing_pb_meta = get_playbook_meta(meta, playbook.id)
    pb_meta: dict = {}
    if playbook.description:
        pb_meta["description"] = playbook.description
    if playbook.folder:
        pb_meta["folder"] = playbook.folder
    elif existing_pb_meta.get("folder"):
        pb_meta["folder"] = existing_pb_meta["folder"]
    set_playbook_meta(meta, playbook.id, pb_meta)
    write_meta(layout, meta)

    return path


def remove_playbook(layout: AnsibleLayout, playbook_id: str) -> None:
    """Delete the playbook file and remove from .racksmith.yml."""
    for ext in (".yml", ".yaml"):
        path = layout.playbooks_path / f"{playbook_id}{ext}"
        if path.is_file():
            path.unlink()

    meta = read_meta(layout)
    remove_playbook_meta(meta, playbook_id)
    write_meta(layout, meta)
