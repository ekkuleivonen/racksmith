"""Role metadata I/O — read/write meta/main.yml, galaxy_info, argument_specs.

Racksmith metadata (labels, input UI hints) is no longer embedded in meta/main.yml.
It lives in .racksmith.yml via racksmith_meta. Role directories use ID-based names.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from _utils.logging import get_logger

from . import atomic_yaml_dump, validate_safe_id
from .config import AnsibleLayout
from .racksmith_meta import (
    get_role_meta,
    read_meta,
    remove_role_meta,
    set_role_meta,
    write_meta,
)

logger = get_logger(__name__)

ACTION_YAML = "action.yaml"
ACTION_YML = "action.yml"
META_MAIN = "meta/main.yml"
TASKS_MAIN = "tasks/main.yml"
DEFAULTS_MAIN = "defaults/main.yml"


@dataclass
class RoleInput:
    key: str
    description: str = ""
    type: str = "str"
    default: Any = None
    required: bool = False
    choices: list[Any] = field(default_factory=list)
    no_log: bool = False
    racksmith_placeholder: str = ""
    racksmith_secret: bool = False


@dataclass
class RoleData:
    name: str
    description: str = ""
    platforms: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    inputs: list[RoleInput] = field(default_factory=list)
    has_tasks: bool = False
    id: str = ""
    registry_id: str = ""
    registry_version: int = 0


def _action_type_to_ansible(t: str) -> str:
    mapping = {"string": "str", "bool": "bool", "boolean": "bool", "secret": "str"}
    return mapping.get(t, "str")


def _parse_argument_specs_option(key: str, opt: dict) -> RoleInput:
    return RoleInput(
        key=key,
        description=str(opt.get("description", "")),
        type=opt.get("type", "str"),
        default=opt.get("default"),
        required=opt.get("required", False),
        choices=opt.get("choices", []) or [],
        no_log=opt.get("no_log", False),
    )


def _parse_action_input(inp: dict) -> RoleInput:
    t = inp.get("type", "string")
    options = inp.get("options", [])
    return RoleInput(
        key=inp.get("key", ""),
        description=inp.get("label", ""),
        type=_action_type_to_ansible(t),
        default=inp.get("default"),
        required=inp.get("required", False),
        choices=options,
        no_log=(t == "secret"),
        racksmith_placeholder=inp.get("placeholder", ""),
        racksmith_secret=inp.get("secret", False),
    )


def _role_from_meta_main(role_dir: Path, data: dict) -> RoleData:
    """Build RoleData from meta/main.yml (galaxy_info + argument_specs). Pure Ansible."""
    gi = data.get("galaxy_info") or {}
    if not isinstance(gi, dict):
        gi = {}
    name = str(gi.get("role_name", role_dir.name))
    description = str(gi.get("description", ""))
    platforms = gi.get("platforms", [])
    if not isinstance(platforms, list):
        platforms = []
    tags = gi.get("galaxy_tags", [])
    if not isinstance(tags, list):
        tags = []

    inputs: list[RoleInput] = []
    argspec = data.get("argument_specs") or {}
    main_opts = (argspec.get("main") or {}).get("options") or {}
    if isinstance(main_opts, dict):
        for k, v in main_opts.items():
            if isinstance(v, dict):
                inputs.append(_parse_argument_specs_option(k, v))

    tasks_file = role_dir / TASKS_MAIN
    return RoleData(
        name=name,
        description=description,
        platforms=platforms,
        tags=tags,
        inputs=inputs,
        has_tasks=tasks_file.is_file(),
        id=role_dir.name,
    )


def _role_from_action_yaml(role_dir: Path, data: dict) -> RoleData:
    """Build RoleData from action.yaml (legacy format)."""
    name = str(data.get("name", role_dir.name))
    description = str(data.get("description", ""))
    labels = data.get("labels", [])
    if not isinstance(labels, list):
        labels = []
    compat = data.get("compatibility") or {}
    os_family = compat.get("os_family", [])
    if not isinstance(os_family, list):
        os_family = []
    platforms = [{"name": f"{x}"} for x in os_family] if os_family else []

    inputs: list[RoleInput] = []
    for inp in data.get("inputs", []):
        if isinstance(inp, dict):
            inputs.append(_parse_action_input(inp))

    tasks_file = role_dir / "tasks" / "main.yml"
    if not tasks_file.is_file():
        tasks_file = role_dir / "tasks" / "main.yaml"
    return RoleData(
        name=name,
        description=description,
        platforms=platforms,
        tags=labels,
        inputs=inputs,
        has_tasks=tasks_file.is_file(),
        id=role_dir.name,
    )


def read_role(role_dir: Path) -> RoleData | None:
    """Parse meta/main.yml for galaxy_info + argument_specs. Falls back to action.yaml."""
    role_dir = Path(role_dir)
    meta_path = role_dir / META_MAIN
    action_path = role_dir / ACTION_YAML
    if not action_path.is_file():
        action_path = role_dir / ACTION_YML

    if meta_path.is_file():
        try:
            data = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return _role_from_meta_main(role_dir, data)
        except (OSError, yaml.YAMLError):
            logger.warning("role_meta_parse_failed", path=str(meta_path), exc_info=True)

    if action_path.is_file():
        try:
            data = yaml.safe_load(action_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return _role_from_action_yaml(role_dir, data)
        except (OSError, yaml.YAMLError):
            logger.warning("role_action_parse_failed", path=str(action_path), exc_info=True)

    return None


def _overlay_racksmith_meta(role: RoleData, role_meta: dict) -> None:
    """Overlay racksmith-specific metadata from .racksmith.yml onto a RoleData.

    Core role metadata (name, description, labels, compatibility) comes
    exclusively from ``meta/main.yml`` (galaxy_info).  ``.racksmith.yml``
    stores only per-input UI hints (secret + placeholder) and the
    registry slug for imported roles.
    """
    role.registry_id = str(role_meta.get("registry_id", ""))
    role.registry_version = int(role_meta.get("registry_version", 0))
    inputs_meta = role_meta.get("inputs") or {}
    if isinstance(inputs_meta, dict):
        for inp in role.inputs:
            inp_meta = inputs_meta.get(inp.key) or {}
            if isinstance(inp_meta, dict):
                inp.racksmith_placeholder = str(inp_meta.get("placeholder", inp.racksmith_placeholder))
                inp.racksmith_secret = bool(inp_meta.get("secret", inp.racksmith_secret))


def list_roles(layout: AnsibleLayout) -> list[RoleData]:
    """Scan roles_path/, parse each subdirectory, overlay racksmith meta."""
    roles_path = layout.roles_path
    if not roles_path.is_dir():
        return []
    meta = read_meta(layout)
    results: list[RoleData] = []
    for sub in sorted(roles_path.iterdir()):
        if sub.is_dir() and not sub.name.startswith("."):
            role = read_role(sub)
            if role is not None:
                role.id = sub.name
                role_meta = get_role_meta(meta, sub.name)
                _overlay_racksmith_meta(role, role_meta)
                results.append(role)
    return results


def read_role_tasks(role_dir: Path) -> str:
    """Read tasks/main.yml raw content."""
    for name in ("main.yml", "main.yaml"):
        path = role_dir / "tasks" / name
        if path.is_file():
            return path.read_text(encoding="utf-8")
    return ""


def read_role_defaults(role_dir: Path) -> dict:
    """Read defaults/main.yml."""
    for name in ("main.yml", "main.yaml"):
        path = role_dir / "defaults" / name
        if path.is_file():
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                return dict(data) if isinstance(data, dict) else {}
            except (OSError, yaml.YAMLError):
                logger.warning("role_defaults_parse_failed", path=str(path), exc_info=True)
    return {}


def _role_input_to_argument_spec(inp: RoleInput) -> dict:
    """Convert RoleInput to pure Ansible argument_spec (no x_racksmith)."""
    spec: dict[str, Any] = {
        "type": inp.type,
        "description": inp.description or inp.key,
    }
    if inp.default is not None:
        spec["default"] = inp.default
    if inp.required:
        spec["required"] = True
    if inp.choices:
        spec["choices"] = inp.choices
    if inp.no_log:
        spec["no_log"] = True
    return spec


def write_role(
    layout: AnsibleLayout, role: RoleData, tasks_yaml: str | None = None
) -> Path:
    """Write/update roles/{id}/meta/main.yml + tasks/main.yml + .racksmith.yml.

    Directory name is role.id (generated ID like role_a1b2c3).
    """
    validate_safe_id(role.id)
    layout.roles_path.mkdir(parents=True, exist_ok=True)
    dir_name = role.id
    role_dir = layout.roles_path / dir_name
    role_dir.mkdir(parents=True, exist_ok=True)
    (role_dir / "meta").mkdir(exist_ok=True)
    (role_dir / "tasks").mkdir(exist_ok=True)

    # Pure Ansible meta/main.yml — no x_racksmith keys
    meta_data: dict[str, Any] = {
        "galaxy_info": {
            "role_name": role.name,
            "description": role.description,
            "platforms": role.platforms,
            "galaxy_tags": role.tags,
        },
        "argument_specs": {
            "main": {
                "options": {
                    inp.key: _role_input_to_argument_spec(inp)
                    for inp in role.inputs
                }
            }
        },
    }
    meta_path = role_dir / META_MAIN
    atomic_yaml_dump(meta_data, meta_path)

    tasks_content = tasks_yaml if tasks_yaml is not None else ""
    if not tasks_content.strip():
        tasks_content = "---\n# Add your Ansible tasks here\n"
    (role_dir / TASKS_MAIN).write_text(tasks_content, encoding="utf-8")

    # Racksmith-specific metadata: only per-input UI hints (secret + placeholder)
    role_meta: dict[str, Any] = {}
    inputs_meta: dict[str, dict] = {}
    for inp in role.inputs:
        inp_data: dict[str, Any] = {}
        if inp.racksmith_placeholder:
            inp_data["placeholder"] = inp.racksmith_placeholder
        if inp.racksmith_secret:
            inp_data["secret"] = inp.racksmith_secret
        if inp_data:
            inputs_meta[inp.key] = inp_data
    if inputs_meta:
        role_meta["inputs"] = inputs_meta

    meta = read_meta(layout)
    set_role_meta(meta, dir_name, role_meta)
    write_meta(layout, meta)

    return role_dir


def remove_role(layout: AnsibleLayout, role_id: str) -> None:
    """Delete the entire role directory and remove from .racksmith.yml.

    Raises ValueError if any local playbook references this role.
    """
    from .playbooks import list_playbooks as list_local_playbooks

    affected = [
        p.id for p in list_local_playbooks(layout)
        if any(r.role == role_id for r in p.roles)
    ]
    if affected:
        raise ValueError(
            f"Role '{role_id}' is used by playbooks: {', '.join(affected)}. "
            f"Remove it from those playbooks first."
        )

    role_dir = layout.roles_path / role_id
    if role_dir.is_symlink():
        role_dir.unlink()
    elif role_dir.is_dir():
        import shutil
        shutil.rmtree(role_dir)

    meta = read_meta(layout)
    remove_role_meta(meta, role_id)
    write_meta(layout, meta)
