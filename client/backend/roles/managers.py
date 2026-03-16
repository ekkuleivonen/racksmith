"""Role CRUD — create/list/delete roles in standard Ansible roles/."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import cast

import yaml
from pydantic import ValidationError

from _utils.helpers import generate_unique_id, new_id, now_iso
from _utils.logging import get_logger
from _utils.repo_helpers import get_layout, get_layout_or_none
from _utils.run_manager import RunManagerMixin
from _utils.runs import load_run, save_run
from _utils.schemas import RoleInputSpec, RunStatus
from _utils.slugs import humanize_key
from auth.git import aget_head_sha
from auth.session import SessionData
from core.config import AnsibleLayout
from core.racksmith_meta import get_role_meta, read_meta
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
from core.run import validate_become_password
from playbooks.managers import playbook_manager
from roles.schemas import (
    RoleCreate,
    RoleDetail,
    RoleRun,
    RoleRunRequest,
    RoleSummary,
    RoleUpdate,
)

logger = get_logger(__name__)


def _generate_role_id(layout: AnsibleLayout) -> str:
    existing = {sub.name for sub in layout.roles_path.iterdir()} if layout.roles_path.is_dir() else set()
    return generate_unique_id("role", lambda c: c in existing)


def _request_input_to_role_input(inp: RoleInputSpec | dict) -> RoleInput:
    if hasattr(inp, "model_dump"):
        inp = inp.model_dump()
    t = inp.get("type", "string")
    options = inp.get("options", []) or inp.get("choices", [])
    label = inp.get("label", "")
    description = inp.get("description", "") or label
    return RoleInput(
        key=inp.get("key", ""),
        description=description,
        type={"string": "str", "bool": "bool", "boolean": "bool", "secret": "str"}.get(t, "str"),
        default=inp.get("default"),
        required=inp.get("required", False),
        choices=options,
        no_log=(t == "secret"),
        racksmith_placeholder=inp.get("placeholder", ""),
        racksmith_secret=inp.get("secret", False),
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
            })
            for inp in r.inputs
        ],
        outputs=list(r.outputs),
        labels=r.tags,
        compatibility={"os_family": [p.get("name", "") for p in r.platforms]},
        has_tasks=r.has_tasks,
        registry_id=r.registry_id,
        registry_version=r.registry_version,
    )


class RoleManager(RunManagerMixin):
    def list_roles(self, session: SessionData) -> list[RoleSummary]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        return [_role_data_to_summary(r) for r in list_roles(layout)]

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
            has_tasks=bool(body.tasks),
            id=role_id,
        )
        tasks_yaml = (
            yaml.safe_dump(body.tasks, sort_keys=False, allow_unicode=True)
            if body.tasks
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
        tasks_yaml = (
            yaml.safe_dump(tasks_list, sort_keys=False, allow_unicode=True)
            if tasks_list is not None
            else None
        )
        write_role(layout, role_data, tasks_yaml=tasks_yaml)
        logger.info("role_updated", role_id=role_id)
        return self.get_role_detail(session, role_id)

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
            await validate_become_password(
                repo_path, hosts, body.become_password
            )

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
            repo_path=str(repo_path),
            role_id=role_id,
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

    @staticmethod
    async def _result_to_sse(data: dict) -> AsyncGenerator[str]:
        """Convert a validated dict to YAML and yield SSE lines."""
        import asyncio

        yaml_text = yaml.dump(data, default_flow_style=False, sort_keys=False)
        for line in yaml_text.splitlines(keepends=True):
            yield f"data: {json.dumps(line)}\n\n"
            await asyncio.sleep(0.03)
        yield "data: [DONE]\n\n"

    async def generate_with_validation(self, prompt: str) -> AsyncGenerator[str]:
        from _utils.ai import get_model, role_agent, stream_thinking
        from playbooks.prompts import ROLE_THINKING_INSTRUCTIONS
        from roles.prompts import ROLE_SYSTEM_PROMPT

        async for delta in stream_thinking(prompt, ROLE_THINKING_INSTRUCTIONS):
            yield f"data: {json.dumps({'thinking': delta})}\n\n"

        result = await role_agent.run(prompt, model=get_model(), instructions=ROLE_SYSTEM_PROMPT)
        async for event in self._result_to_sse(result.output.model_dump(exclude_defaults=True)):
            yield event

    async def edit_with_validation(self, existing_yaml: str, prompt: str) -> AsyncGenerator[str]:
        from _utils.ai import get_model, role_agent, stream_thinking
        from playbooks.prompts import ROLE_THINKING_INSTRUCTIONS
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

        async for delta in stream_thinking(user_prompt, ROLE_THINKING_INSTRUCTIONS):
            yield f"data: {json.dumps({'thinking': delta})}\n\n"

        result = await role_agent.run(user_prompt, model=get_model(), instructions=ROLE_EDIT_SYSTEM_PROMPT)
        async for event in self._result_to_sse(result.output.model_dump(exclude_defaults=True)):
            yield event

role_manager = RoleManager()
