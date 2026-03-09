"""Role metadata I/O — read/write meta/main.yml, galaxy_info, argument_specs."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from ruamel.yaml import YAML

from .config import AnsibleLayout


def _yaml_rt() -> YAML:
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.default_flow_style = False
    return y

X_RACKSMITH = "x_racksmith"
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
    racksmith_label: str = ""
    racksmith_placeholder: str = ""
    racksmith_interactive: bool = False


@dataclass
class RoleData:
    slug: str
    name: str
    description: str = ""
    platforms: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    inputs: list[RoleInput] = field(default_factory=list)
    has_tasks: bool = False


def _action_type_to_ansible(t: str) -> str:
    mapping = {"string": "str", "bool": "bool", "boolean": "bool", "select": "str", "secret": "str"}
    return mapping.get(t, "str")


def _parse_argument_specs_option(key: str, opt: dict) -> RoleInput:
    xr = opt.get(X_RACKSMITH) or {}
    if not isinstance(xr, dict):
        xr = {}
    return RoleInput(
        key=key,
        description=str(opt.get("description", "")),
        type=opt.get("type", "str"),
        default=opt.get("default"),
        required=opt.get("required", False),
        choices=opt.get("choices", []) or [],
        no_log=opt.get("no_log", False),
        racksmith_label=str(xr.get("label", "")),
        racksmith_placeholder=str(xr.get("placeholder", "")),
        racksmith_interactive=bool(xr.get("interactive", False)),
    )


def _parse_action_input(inp: dict) -> RoleInput:
    t = inp.get("type", "string")
    options = inp.get("options", [])
    return RoleInput(
        key=inp.get("key", ""),
        description="",
        type=_action_type_to_ansible(t),
        default=inp.get("default"),
        required=inp.get("required", False),
        choices=options,
        no_log=(t == "secret"),
        racksmith_label=inp.get("label", ""),
        racksmith_placeholder=inp.get("placeholder", ""),
        racksmith_interactive=inp.get("interactive", False),
    )


def _role_from_meta_main(role_dir: Path, data: dict) -> RoleData:
    """Build RoleData from meta/main.yml (galaxy_info + argument_specs)."""
    gi = data.get("galaxy_info") or {}
    if not isinstance(gi, dict):
        gi = {}
    slug = role_dir.name
    name = str(gi.get("role_name", slug))
    description = str(gi.get("description", ""))
    platforms = gi.get("platforms", [])
    if not isinstance(platforms, list):
        platforms = []
    tags = gi.get("galaxy_tags", [])
    if not isinstance(tags, list):
        tags = []
    xr = data.get(X_RACKSMITH) or {}
    if not isinstance(xr, dict):
        xr = {}

    inputs: list[RoleInput] = []
    argspec = data.get("argument_specs") or {}
    main_opts = (argspec.get("main") or {}).get("options") or {}
    if isinstance(main_opts, dict):
        for k, v in main_opts.items():
            if isinstance(v, dict):
                inputs.append(_parse_argument_specs_option(k, v))

    tasks_file = role_dir / TASKS_MAIN
    return RoleData(
        slug=slug,
        name=name,
        description=description,
        platforms=platforms,
        tags=tags,
        inputs=inputs,
        has_tasks=tasks_file.is_file(),
    )


def _role_from_action_yaml(role_dir: Path, data: dict) -> RoleData:
    """Build RoleData from action.yaml (legacy format)."""
    slug = data.get("slug") or role_dir.name
    name = str(data.get("name", slug))
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
        slug=slug,
        name=name,
        description=description,
        platforms=platforms,
        tags=labels,
        inputs=inputs,
        has_tasks=tasks_file.is_file(),
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
            pass

    if action_path.is_file():
        try:
            data = yaml.safe_load(action_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return _role_from_action_yaml(role_dir, data)
        except (OSError, yaml.YAMLError):
            pass

    return None


def list_roles(layout: AnsibleLayout) -> list[RoleData]:
    """Scan roles_path/, parse each subdirectory."""
    roles_path = layout.roles_path
    if not roles_path.is_dir():
        return []
    results: list[RoleData] = []
    for sub in sorted(roles_path.iterdir()):
        if sub.is_dir() and not sub.name.startswith("."):
            role = read_role(sub)
            if role is not None:
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
                pass
    return {}


def _role_input_to_argument_spec(inp: RoleInput) -> dict:
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
    if inp.racksmith_label or inp.racksmith_placeholder or inp.racksmith_interactive:
        spec[X_RACKSMITH] = {
            "label": inp.racksmith_label,
            "placeholder": inp.racksmith_placeholder,
            "interactive": inp.racksmith_interactive,
        }
    return spec


def write_role(
    layout: AnsibleLayout, role: RoleData, tasks_yaml: str | None = None
) -> Path:
    """Write/update roles/{slug}/meta/main.yml + tasks/main.yml."""
    layout.roles_path.mkdir(parents=True, exist_ok=True)
    role_dir = layout.roles_path / role.slug
    role_dir.mkdir(parents=True, exist_ok=True)
    (role_dir / "meta").mkdir(exist_ok=True)
    (role_dir / "tasks").mkdir(exist_ok=True)

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
    meta_path.write_text("", encoding="utf-8")
    _yaml_rt().dump(meta_data, meta_path)

    tasks_content = tasks_yaml if tasks_yaml is not None else ""
    if not tasks_content.strip():
        tasks_content = "---\n# Add your Ansible tasks here\n"
    (role_dir / TASKS_MAIN).write_text(tasks_content, encoding="utf-8")

    return role_dir


def remove_role(layout: AnsibleLayout, slug: str) -> None:
    """Delete the entire role directory."""
    role_dir = layout.roles_path / slug
    if role_dir.is_dir():
        import shutil
        shutil.rmtree(role_dir)
