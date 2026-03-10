"""Role CRUD — create/list/delete roles in standard Ansible roles/."""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

import yaml
import redis.asyncio as aioredis
import settings

from _utils.logging import get_logger

logger = get_logger(__name__)
from ansible import resolve_layout
from ansible.run import validate_become_password
from github.misc import RepoNotAvailableError
from ansible.roles import (
    RoleData,
    RoleInput,
    list_roles,
    read_role,
    read_role_tasks,
    remove_role,
    write_role,
)

from _utils.db import _get_db, row_to_role_run
from github.misc import get_head_sha, user_storage_id
from playbooks.managers import playbook_manager
from repos.managers import repos_manager

from roles.schemas import (
    RoleCreateRequest,
    RoleDetail,
    RoleRun,
    RoleRunRequest,
    RoleSummary,
    RoleUpdateRequest,
)

from _utils.slugs import SLUG_RE, validate_slug


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _validate_slug(slug: str) -> None:
    validate_slug(slug)


def _request_input_to_role_input(inp: dict) -> RoleInput:
    t = inp.get("type", "string")
    return RoleInput(
        key=inp.get("key", ""),
        description=inp.get("label", ""),
        type={"string": "str", "bool": "bool", "boolean": "bool", "select": "str", "secret": "str"}.get(
            t, "str"
        ),
        default=inp.get("default"),
        required=inp.get("required", False),
        choices=inp.get("options", []) or [],
        no_log=(t == "secret"),
        racksmith_label=inp.get("label", ""),
        racksmith_placeholder=inp.get("placeholder", ""),
        racksmith_interactive=inp.get("interactive", False),
    )


def _role_data_to_summary(r: RoleData) -> RoleSummary:
    return RoleSummary(
        slug=r.slug,
        name=r.name,
        description=r.description,
        inputs=[
            {
                "key": inp.key,
                "label": inp.racksmith_label,
                "type": inp.type,
                "default": inp.default,
                "required": inp.required,
                "options": inp.choices,
                "placeholder": inp.racksmith_placeholder,
                "interactive": inp.racksmith_interactive,
            }
            for inp in r.inputs
        ],
        labels=r.tags,
        compatibility={"os_family": [p.get("name", "") for p in r.platforms]},
        has_tasks=r.has_tasks,
    )


class RoleManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    def list_roles(self, session) -> list[RoleSummary]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
        return [_role_data_to_summary(r) for r in list_roles(layout)]

    def get_role(self, session, slug: str) -> RoleSummary:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role_dir = layout.roles_path / slug
        role = read_role(role_dir)
        if role is None:
            raise FileNotFoundError(f"Role '{slug}' not found")
        return _role_data_to_summary(role)

    def get_role_detail(self, session, slug: str) -> RoleDetail:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role_dir = layout.roles_path / slug
        role = read_role(role_dir)
        if role is None:
            raise FileNotFoundError(f"Role '{slug}' not found")
        tasks_content = read_role_tasks(role_dir)
        meta_path = role_dir / "meta" / "main.yml"
        raw_meta = ""
        if meta_path.is_file():
            raw_meta = meta_path.read_text(encoding="utf-8")
        combined: dict = {
            "slug": role.slug,
            "name": role.name,
            "description": role.description,
            "labels": role.tags,
            "compatibility": {"os_family": [p.get("name", "") for p in role.platforms]},
            "inputs": [
                {
                    "key": inp.key,
                    "label": inp.racksmith_label,
                    "type": inp.type,
                    "default": inp.default,
                    "required": inp.required,
                    "options": inp.choices,
                    "placeholder": inp.racksmith_placeholder,
                    "interactive": inp.racksmith_interactive,
                }
                for inp in role.inputs
            ],
        }
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

    def create_role(self, session, body: RoleCreateRequest) -> RoleSummary:
        _validate_slug(body.slug)
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role_dir = layout.roles_path / body.slug
        if role_dir.exists():
            raise ValueError(f"Role '{body.slug}' already exists")
        platforms = [
            {"name": x}
            for x in body.compatibility.get("os_family", [])
        ]
        role_data = RoleData(
            slug=body.slug,
            name=body.name,
            description=body.description,
            platforms=platforms,
            tags=body.labels,
            inputs=[_request_input_to_role_input(i) for i in body.inputs],
            has_tasks=bool(body.tasks),
        )
        tasks_yaml = (
            yaml.safe_dump(body.tasks, sort_keys=False, allow_unicode=True)
            if body.tasks
            else None
        )
        write_role(layout, role_data, tasks_yaml=tasks_yaml)
        role = read_role(layout.roles_path / body.slug)
        if role is None:
            raise RuntimeError("Role was written but could not be read back")
        logger.info("role_created", slug=body.slug)
        return _role_data_to_summary(role)

    def update_role(self, session, slug: str, body: RoleUpdateRequest) -> RoleDetail:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role_dir = layout.roles_path / slug
        if not role_dir.exists():
            raise FileNotFoundError(f"Role '{slug}' not found")
        try:
            data = yaml.safe_load(body.yaml_text)
        except yaml.YAMLError as exc:
            raise ValueError(f"Invalid YAML: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("YAML must be a mapping (dict)")
        tasks_list = data.pop("tasks", None)
        data["slug"] = slug
        try:
            request = RoleCreateRequest.model_validate(data)
        except Exception as exc:
            raise ValueError(f"Invalid role format: {exc}") from exc
        platforms = [
            {"name": x}
            for x in request.compatibility.get("os_family", [])
        ]
        role_data = RoleData(
            slug=slug,
            name=request.name,
            description=request.description,
            platforms=platforms,
            tags=request.labels,
            inputs=[_request_input_to_role_input(i) for i in request.inputs],
            has_tasks=bool(tasks_list),
        )
        tasks_yaml = (
            yaml.safe_dump(tasks_list, sort_keys=False, allow_unicode=True)
            if tasks_list is not None
            else None
        )
        write_role(layout, role_data, tasks_yaml=tasks_yaml)
        logger.info("role_updated", slug=slug)
        return self.get_role_detail(session, slug)

    def delete_role(self, session, slug: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role_dir = layout.roles_path / slug
        if not role_dir.exists():
            raise FileNotFoundError(f"Role '{slug}' not found")
        remove_role(layout, slug)
        logger.info("role_removed", slug=slug)

    async def create_run(self, session, slug: str, body: RoleRunRequest) -> RoleRun:
        repo_path = repos_manager.active_repo_path(session)
        role = self.get_role(session, slug)
        hosts = playbook_manager.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        if body.become and body.become_password:
            await validate_become_password(
                repo_path, hosts, body.become_password
            )

        user_id = user_storage_id(session.user)
        commit_sha = get_head_sha(repo_path)
        run = RoleRun(
            id=_new_id(),
            role_slug=role.slug,
            role_name=role.name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
            vars=body.vars,
            become=body.become,
            commit_sha=commit_sha,
        )
        db = _get_db()
        await db.execute(
            """INSERT INTO role_runs
               (id, user_id, role_slug, role_name, status, created_at, hosts, output, vars, become, commit_sha)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run.id,
                user_id,
                run.role_slug,
                run.role_name,
                run.status,
                run.created_at,
                json.dumps(run.hosts),
                run.output,
                json.dumps(run.vars),
                int(run.become),
                run.commit_sha,
            ),
        )
        await db.commit()
        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        await self._arq_pool.enqueue_job(
            "execute_role_run",
            run_id=run.id,
            repo_path=str(repo_path),
            role_slug=slug,
            hosts=hosts,
            role_vars=body.vars,
            become=body.become,
            runtime_vars=body.runtime_vars or {},
            become_password=body.become_password,
        )
        logger.info(
            "role_run_submitted",
            run_id=run.id,
            role_slug=slug,
            host_count=len(hosts),
        )
        return run

    async def list_runs(self, session, role_slug: str | None = None) -> list[RoleRun]:
        user_id = user_storage_id(session.user)
        db = _get_db()
        if role_slug:
            cursor = await db.execute(
                "SELECT * FROM role_runs WHERE user_id = ? AND role_slug = ? ORDER BY created_at DESC",
                (user_id, role_slug),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM role_runs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        rows = await cursor.fetchall()
        return [row_to_role_run(row) for row in rows]

    async def get_run(self, session, run_id: str) -> RoleRun:
        user_id = user_storage_id(session.user)
        db = _get_db()
        cursor = await db.execute(
            "SELECT * FROM role_runs WHERE id = ? AND user_id = ?",
            (run_id, user_id),
        )
        row = await cursor.fetchone()
        if row is None:
            raise KeyError("Run not found")
        return row_to_role_run(row)

    async def stream_run(self, session, run_id: str, websocket) -> None:
        run = await self.get_run(session, run_id)
        if run.status in ("completed", "failed"):
            await websocket.send_json(
                {"type": "snapshot", "run": run.model_dump(), "done": True}
            )
            return
        channel = f"{settings.REDIS_RUN_EVENTS_PREFIX}{run_id}:events"
        redis_client = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
        pubsub = redis_client.pubsub()
        try:
            await pubsub.subscribe(channel)
            await websocket.send_json({"type": "snapshot", "run": run.model_dump()})
            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=5.0
                )
                if message is None:
                    run = await self.get_run(session, run_id)
                    if run.status in ("completed", "failed"):
                        await websocket.send_json(
                            {
                                "type": "snapshot",
                                "run": run.model_dump(),
                                "done": True,
                            }
                        )
                        break
                    continue
                if message["type"] != "message":
                    continue
                payload = json.loads(message["data"])
                if payload.get("type") == "output":
                    await websocket.send_json(payload)
                elif payload.get("type") == "status":
                    run = await self.get_run(session, run_id)
                    await websocket.send_json(
                        {"type": "status", "run": run.model_dump()}
                    )
                elif payload.get("type") == "done":
                    run = await self.get_run(session, run_id)
                    await websocket.send_json(
                        {
                            "type": "snapshot",
                            "run": run.model_dump(),
                            "done": True,
                        }
                    )
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await redis_client.aclose()


role_manager = RoleManager()
