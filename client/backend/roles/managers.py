"""Role CRUD — create/list/delete roles in standard Ansible roles/."""

from __future__ import annotations

import json
import shlex
from collections.abc import AsyncGenerator
from typing import Any, cast

import yaml
from pydantic import ValidationError

from _utils.helpers import generate_unique_id, new_id, now_iso
from _utils.logging import get_logger
from _utils.pagination import sort_order_reverse
from _utils.repo_helpers import get_layout, get_layout_or_none
from _utils.run_manager import RunManagerMixin
from _utils.runs import load_run, save_run
from _utils.schemas import RoleInputSpec, RunStatus
from _utils.slugs import humanize_key
from auth.git import aget_head_sha
from auth.session import SessionData
from core.config import AnsibleLayout
from core.racksmith_meta import get_role_meta, read_meta, set_role_meta, write_meta
from core.roles import (
    RoleData,
    RoleInput,
    _overlay_racksmith_meta,
    list_roles,
    read_role,
    read_role_tasks,
    remove_role,
    write_role,
)
from core.serialize import serialize_all_role_files, serialize_group_vars, serialize_host_vars, serialize_inventory
from daemon.client import daemon_post
from playbooks.managers import playbook_manager
from roles.schemas import (
    LocalRoleFacetItem,
    RoleCreate,
    RoleDetail,
    RoleFacetsResponse,
    RoleRun,
    RoleRunRequest,
    RoleSummary,
    RoleUpdate,
)

logger = get_logger(__name__)

# Modules that accept free-form (string) arguments.  LLMs sometimes emit
# these as a YAML list, which Ansible rejects.  Strategy per module:
#   "argv"  → wrap list in {"argv": <list>}  (command supports argv)
#   "join"  → shlex.join into a single string
_FREEFORM_MODULES: dict[str, str] = {
    "command": "argv",
    "ansible.builtin.command": "argv",
    "shell": "join",
    "ansible.builtin.shell": "join",
    "raw": "join",
    "ansible.builtin.raw": "join",
    "script": "join",
    "ansible.builtin.script": "join",
}


def _normalize_tasks(tasks: list[Any]) -> list[Any]:
    """Fix common LLM mistakes in Ansible task definitions.

    Converts list-valued free-form modules (command, shell, …) to the
    format Ansible actually accepts.
    """
    out: list[Any] = []
    for task in tasks:
        if not isinstance(task, dict):
            out.append(task)
            continue
        task = dict(task)
        for module, strategy in _FREEFORM_MODULES.items():
            if module not in task or not isinstance(task[module], list):
                continue
            args: list[Any] = task[module]
            if strategy == "argv":
                task[module] = {"argv": [str(a) for a in args]}
            else:
                task[module] = shlex.join(str(a) for a in args)
            break
        for block_key in ("block", "rescue", "always"):
            if block_key in task and isinstance(task[block_key], list):
                task[block_key] = _normalize_tasks(task[block_key])
        out.append(task)
    return out


def _generate_role_id(layout: AnsibleLayout) -> str:
    existing = {sub.name for sub in layout.roles_path.iterdir()} if layout.roles_path.is_dir() else set()
    return generate_unique_id("role", lambda c: c in existing)


def _request_input_to_role_input(inp: RoleInputSpec | dict) -> RoleInput:
    spec = inp if isinstance(inp, RoleInputSpec) else RoleInputSpec.model_validate(inp)
    d = spec.model_dump()
    t = d.get("type", "string")
    options = d.get("options", []) or d.get("choices", [])
    label = d.get("label", "")
    description = d.get("description", "") or label
    secret = bool(d.get("secret"))
    return RoleInput(
        key=d.get("key", ""),
        description=description,
        type={"string": "str", "bool": "bool", "boolean": "bool", "secret": "str", "list": "list", "dict": "dict", "int": "int"}.get(t, "str"),
        default=d.get("default"),
        required=d.get("required", False),
        choices=options,
        no_log=secret,
        racksmith_placeholder=d.get("placeholder", ""),
        racksmith_secret=secret,
        racksmith_runtime=bool(d.get("runtime")),
        racksmith_label=label,
    )


def _role_data_to_summary(r: RoleData) -> RoleSummary:
    return RoleSummary(
        id=r.id,
        name=r.name,
        description=r.description,
        inputs=[
            RoleInputSpec.model_validate({
                "key": inp.key,
                "label": inp.racksmith_label or humanize_key(inp.key),
                "description": inp.description,
                "type": inp.type,
                "default": inp.default,
                "required": inp.required,
                "options": inp.choices,
                "placeholder": inp.racksmith_placeholder,
                "secret": inp.racksmith_secret,
                "runtime": inp.racksmith_runtime,
            })
            for inp in r.inputs
        ],
        outputs=list(r.outputs),
        labels=r.tags,
        compatibility={"os_family": [p.get("name", "") for p in r.platforms]},
        has_tasks=r.has_tasks,
        registry_id=r.registry_id,
        registry_version=r.registry_version,
        folder=r.folder,
    )


class RoleManager(RunManagerMixin):
    def list_roles(self, session: SessionData) -> list[RoleSummary]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        return [_role_data_to_summary(r) for r in list_roles(layout)]

    def list_roles_filtered(
        self,
        session: SessionData,
        *,
        q: str | None,
        label: str | None,
        platform: str | None,
        sort: str,
        order: str,
    ) -> list[RoleSummary]:
        roles = self.list_roles(session)
        qn = (q or "").strip().lower()
        ln = (label or "").strip().lower()
        pn = (platform or "").strip().lower()

        def ok(r: RoleSummary) -> bool:
            if ln and not any(ln == x.lower() for x in r.labels):
                return False
            if pn:
                os_fams = r.compatibility.get("os_family") or []
                if isinstance(os_fams, list):
                    if not any(pn in str(x).lower() for x in os_fams):
                        return False
                elif pn not in str(os_fams).lower():
                    return False
            if qn:
                hay = f"{r.name} {r.description} {' '.join(r.labels)}".lower()
                if qn not in hay:
                    return False
            return True

        filtered = [r for r in roles if ok(r)]
        rev = sort_order_reverse(order)
        sk = (sort or "name").lower()

        def sort_key(r: RoleSummary) -> tuple[int, str, str]:
            if sk == "id":
                return (0, r.id.lower(), r.id)
            if sk == "description":
                return (0, r.description.lower(), r.id)
            return (0, r.name.lower(), r.id)

        filtered.sort(key=sort_key, reverse=rev)
        return filtered

    def get_facets(self, session: SessionData) -> RoleFacetsResponse:
        roles = self.list_roles(session)
        label_counts: dict[str, int] = {}
        platform_counts: dict[str, int] = {}
        for r in roles:
            for lab in r.labels:
                label_counts[lab] = label_counts.get(lab, 0) + 1
            os_fams = r.compatibility.get("os_family") or []
            if isinstance(os_fams, list):
                for os in os_fams:
                    s = str(os).strip()
                    if s:
                        platform_counts[s] = platform_counts.get(s, 0) + 1
            elif os_fams:
                s = str(os_fams).strip()
                if s:
                    platform_counts[s] = platform_counts.get(s, 0) + 1
        labels = sorted(
            (LocalRoleFacetItem(name=k, count=v) for k, v in label_counts.items()),
            key=lambda x: (-x.count, x.name.lower()),
        )
        platforms = sorted(
            (LocalRoleFacetItem(name=k, count=v) for k, v in platform_counts.items()),
            key=lambda x: (-x.count, x.name.lower()),
        )
        return RoleFacetsResponse(labels=labels, platforms=platforms)

    def get_role(self, session: SessionData, role_id: str) -> RoleSummary:
        layout = get_layout(session)
        role_dir = layout.roles_path / role_id
        role = read_role(role_dir)
        if role is None:
            raise FileNotFoundError(f"Role '{role_id}' not found")
        role.id = role_id
        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)
        _overlay_racksmith_meta(role, role_meta)
        return _role_data_to_summary(role)

    def get_role_detail(self, session: SessionData, role_id: str) -> RoleDetail:
        layout = get_layout(session)
        role_dir = layout.roles_path / role_id
        role = read_role(role_dir)
        if role is None:
            raise FileNotFoundError(f"Role '{role_id}' not found")
        role.id = role_id
        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)
        _overlay_racksmith_meta(role, role_meta)

        tasks_content = read_role_tasks(role_dir)
        combined: dict = {
            "name": role.name,
            "description": role.description,
            "labels": list(role.tags),
            "compatibility": {"os_family": [p.get("name", "") for p in role.platforms]},
            "inputs": [
                {
                    "key": inp.key,
                    "label": inp.racksmith_label or humanize_key(inp.key),
                    "description": inp.description,
                    "type": inp.type,
                    "default": inp.default,
                    "required": inp.required,
                    "options": list(inp.choices),
                    "placeholder": inp.racksmith_placeholder,
                    "secret": inp.racksmith_secret,
                    "runtime": inp.racksmith_runtime,
                }
                for inp in role.inputs
            ],
        }
        if role.outputs:
            combined["outputs"] = [o.model_dump(exclude_defaults=True) | {"key": o.key} for o in role.outputs]
        if tasks_content.strip():
            try:
                combined["tasks"] = yaml.safe_load(tasks_content)
            except yaml.YAMLError:
                combined["tasks"] = []
        else:
            combined["tasks"] = []
        raw_content = yaml.safe_dump(combined, sort_keys=False, allow_unicode=True)
        summary = _role_data_to_summary(role)
        return RoleDetail(
            **summary.model_dump(),
            raw_content=raw_content,
            tasks_content=tasks_content,
        )

    def create_role(self, session: SessionData, body: RoleCreate) -> RoleSummary:
        layout = get_layout(session)

        role_id = _generate_role_id(layout)

        platforms = [
            {"name": x}
            for x in body.compatibility.get("os_family", [])
        ]
        role_data = RoleData(
            name=body.name,
            description=body.description,
            platforms=platforms,
            tags=body.labels,
            inputs=[_request_input_to_role_input(i) for i in body.inputs],
            outputs=list(body.outputs),
            has_tasks=bool(body.tasks),
            id=role_id,
        )
        tasks = _normalize_tasks(body.tasks) if body.tasks else body.tasks
        tasks_yaml = (
            yaml.safe_dump(tasks, sort_keys=False, allow_unicode=True)
            if tasks
            else None
        )
        write_role(layout, role_data, tasks_yaml=tasks_yaml)
        role = read_role(layout.roles_path / role_id)
        if role is None:
            raise RuntimeError("Role was written but could not be read back")
        role.id = role_id
        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)
        _overlay_racksmith_meta(role, role_meta)
        logger.info("role_created", role_id=role_id)
        return _role_data_to_summary(role)

    def update_role(self, session: SessionData, role_id: str, body: RoleUpdate) -> RoleDetail:
        layout = get_layout(session)
        role_dir = layout.roles_path / role_id
        if not role_dir.exists():
            raise FileNotFoundError(f"Role '{role_id}' not found")
        try:
            data = yaml.safe_load(body.yaml_text)
        except yaml.YAMLError as exc:
            raise ValueError(f"Invalid YAML: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("YAML must be a mapping (dict)")
        tasks_list = data.pop("tasks", None)
        try:
            request = RoleCreate.model_validate(data)
        except Exception as exc:
            raise ValueError(f"Invalid role format: {exc}") from exc
        platforms = [
            {"name": x}
            for x in request.compatibility.get("os_family", [])
        ]
        role_data = RoleData(
            name=request.name,
            description=request.description,
            platforms=platforms,
            tags=request.labels,
            inputs=[_request_input_to_role_input(i) for i in request.inputs],
            has_tasks=bool(tasks_list),
            id=role_id,
        )
        if isinstance(tasks_list, list):
            tasks_list = _normalize_tasks(tasks_list)
        tasks_yaml = (
            yaml.safe_dump(tasks_list, sort_keys=False, allow_unicode=True)
            if tasks_list is not None
            else None
        )
        write_role(layout, role_data, tasks_yaml=tasks_yaml)
        logger.info("role_updated", role_id=role_id)
        return self.get_role_detail(session, role_id)

    def move_to_folder(self, session: SessionData, role_id: str, folder: str) -> None:
        layout = get_layout(session)
        role_dir = layout.roles_path / role_id
        if not role_dir.exists():
            raise FileNotFoundError(f"Role '{role_id}' not found")
        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)
        if folder:
            role_meta["folder"] = folder
        else:
            role_meta.pop("folder", None)
        set_role_meta(meta, role_id, role_meta)
        write_meta(layout, meta)

    def delete_role(self, session: SessionData, role_id: str) -> None:
        layout = get_layout(session)
        role_dir = layout.roles_path / role_id
        if not role_dir.exists():
            raise FileNotFoundError(f"Role '{role_id}' not found")
        remove_role(layout, role_id)
        logger.info("role_removed", role_id=role_id)

    async def _load_run(self, run_id: str) -> RoleRun | None:
        """Load a RoleRun from Redis, or None if expired/missing."""
        data = await load_run(run_id)
        if data is None:
            return None
        return RoleRun(
            id=data.get("id", run_id),
            role_id=data.get("role_id", data.get("role_slug", "")),
            role_name=data.get("role_name", ""),
            status=cast("RunStatus", data.get("status", "queued")),
            created_at=data.get("created_at", ""),
            started_at=data.get("started_at") or None,
            finished_at=data.get("finished_at") or None,
            exit_code=int(data["exit_code"]) if data.get("exit_code") else None,
            hosts=json.loads(data["hosts"]) if data.get("hosts") else [],
            output=data.get("output", ""),
            vars=json.loads(data["vars"]) if data.get("vars") else {},
            become=data.get("become") == "1",
            commit_sha=data.get("commit_sha") or None,
        )

    async def create_run(self, session: SessionData, role_id: str, body: RoleRunRequest) -> RoleRun:
        layout = get_layout(session)
        repo_path = layout.repo_path
        role = self.get_role(session, role_id)
        hosts = playbook_manager.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        if body.become and body.become_password:
            await daemon_post("/ansible/validate-become", {
                "inventory_yaml": serialize_inventory(layout),
                "host_vars": serialize_host_vars(layout),
                "group_vars": serialize_group_vars(layout),
                "hosts": hosts,
                "become_password": body.become_password,
            }, timeout=30.0)

        commit_sha = await aget_head_sha(repo_path)
        run = RoleRun(
            id=new_id(),
            role_id=role_id,
            role_name=role.name,
            status="queued",
            created_at=now_iso(),
            hosts=hosts,
            vars=body.vars,
            become=body.become,
            commit_sha=commit_sha,
        )
        await save_run(run.id, {
            "id": run.id,
            "role_id": run.role_id,
            "role_name": run.role_name,
            "status": run.status,
            "created_at": run.created_at,
            "hosts": json.dumps(run.hosts),
            "output": "",
            "vars": json.dumps(run.vars),
            "become": "1" if run.become else "0",
            "commit_sha": run.commit_sha or "",
        })

        pool = self._ensure_arq_pool()
        await pool.enqueue_job(
            "execute_role_run",
            run_id=run.id,
            role_id=role_id,
            inventory_yaml=serialize_inventory(layout),
            host_vars=serialize_host_vars(layout),
            group_vars=serialize_group_vars(layout),
            role_files=serialize_all_role_files(layout),
            hosts=hosts,
            role_vars=body.vars,
            become=body.become,
            runtime_vars=body.runtime_vars or {},
            become_password=body.become_password,
        )
        logger.info(
            "role_run_submitted",
            run_id=run.id,
            role_id=role_id,
            host_count=len(hosts),
        )
        return run

    @staticmethod
    def validate_role_yaml(yaml_text: str) -> str | None:
        """Return error string if invalid, None if valid."""
        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as exc:
            return f"Invalid YAML syntax: {exc}"
        if not isinstance(data, dict):
            return "YAML must be a mapping"
        try:
            RoleCreate.model_validate(data)
        except ValidationError as exc:
            return str(exc)
        return None

    async def generate_with_validation(self, session: SessionData, prompt: str) -> AsyncGenerator[str]:
        from _utils.agent_stream import AgentDeps, stream_agent
        from _utils.ai import role_agent
        from roles.prompts import ROLE_SYSTEM_PROMPT

        deps = AgentDeps(session=session)
        async for event in stream_agent(role_agent, prompt, deps, instructions=ROLE_SYSTEM_PROMPT):
            yield event

    async def edit_with_validation(self, session: SessionData, existing_yaml: str, prompt: str) -> AsyncGenerator[str]:
        from _utils.agent_stream import AgentDeps, stream_agent
        from _utils.ai import role_agent
        from roles.prompts import ROLE_EDIT_SYSTEM_PROMPT

        try:
            existing_data = yaml.safe_load(existing_yaml)
            existing_json = json.dumps(existing_data, indent=2)
        except Exception:
            existing_json = existing_yaml

        user_prompt = (
            f"Here is the current role definition:\n\n{existing_json}\n\n"
            f"Requested changes:\n{prompt}"
        )
        deps = AgentDeps(session=session)
        async for event in stream_agent(role_agent, user_prompt, deps, instructions=ROLE_EDIT_SYSTEM_PROMPT):
            yield event

role_manager = RoleManager()
