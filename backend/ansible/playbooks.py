"""Playbook I/O — read/write standard Ansible playbook YAML."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml
from ruamel.yaml import YAML

from .config import AnsibleLayout
from .extensions import PREFIX

RESERVED_DESCRIPTION_KEY = f"{PREFIX}description"


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


def read_playbook(path: Path, repo_path: Path | None = None) -> PlaybookData:
    """Parse an Ansible playbook file. Extract racksmith_description from play vars."""
    path = Path(path).resolve()
    raw = path.read_text(encoding="utf-8")
    payload = yaml.safe_load(raw)
    if not isinstance(payload, list) or not payload:
        raise ValueError("Playbook must be a YAML list with at least one play")
    play = payload[0]
    if not isinstance(play, dict):
        raise ValueError("First play must be a mapping")

    description = ""
    vars_block = play.get("vars")
    if isinstance(vars_block, dict):
        desc_val = vars_block.get(RESERVED_DESCRIPTION_KEY)
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
            pass
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


def list_playbooks(layout: AnsibleLayout) -> list[PlaybookData]:
    """Scan playbooks_path/ for *.yml files."""
    playbooks_path = layout.playbooks_path
    if not playbooks_path.is_dir():
        return []
    results: list[PlaybookData] = []
    for path in sorted(playbooks_path.glob("*.yml")):
        if path.is_file():
            try:
                results.append(read_playbook(path, layout.repo_path))
            except (OSError, ValueError, yaml.YAMLError):
                continue
    for path in sorted(playbooks_path.glob("*.yaml")):
        if path.is_file() and not path.with_suffix(".yml").exists():
            try:
                results.append(read_playbook(path, layout.repo_path))
            except (OSError, ValueError, yaml.YAMLError):
                continue
    return results


def _yaml_rt() -> YAML:
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.default_flow_style = False
    return y


def write_playbook(layout: AnsibleLayout, playbook: PlaybookData) -> Path:
    """Serialize to standard Ansible playbook YAML. racksmith_description goes into play vars."""
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

    if playbook.description:
        play["vars"] = {RESERVED_DESCRIPTION_KEY: playbook.description}

    yaml_rt = _yaml_rt()
    path.write_text("", encoding="utf-8")
    yaml_rt.dump([play], path)
    return path


def remove_playbook(layout: AnsibleLayout, playbook_id: str) -> None:
    """Delete the playbook file."""
    for ext in (".yml", ".yaml"):
        path = layout.playbooks_path / f"{playbook_id}{ext}"
        if path.is_file():
            path.unlink()
            return
