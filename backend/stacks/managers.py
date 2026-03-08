"""Stack management, generation, and execution."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
import redis.asyncio as aioredis
import settings
from _utils.db import _get_db, row_to_stack_run
from github.misc import get_head_sha, user_storage_id
from nodes.managers import node_manager
from repos.managers import repos_manager
from schema.models.action import ActionConfig

from stacks.schemas import (
    Action,
    ActionInput,
    StackDetail,
    StackResolveTargetsResponse,
    StackRoleInput,
    StackRun,
    StackRunRequest,
    StackSummary,
    StackTargetSelection,
    StackUpsertRequest,
)

STACKS_DIR = Path(".racksmith/stacks")
ACTIONS_DIR = Path(".racksmith/actions")
INVENTORY_DIR = Path(".racksmith/inventory")

RESERVED_DESCRIPTION_KEY = "racksmith_description"
RUN_EVENTS_CHANNEL_PREFIX = "racksmith:run:"
STACK_ID_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class StackManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    def _stacks_dir(self, repo_path: Path) -> Path:
        return repo_path / STACKS_DIR

    def _actions_dir(self, repo_path: Path) -> Path:
        return repo_path / ACTIONS_DIR

    def _inventory_dir(self, repo_path: Path) -> Path:
        return repo_path / INVENTORY_DIR

    def _stack_path(self, repo_path: Path, stack_id: str) -> Path:
        return self._stacks_dir(repo_path) / f"{stack_id}.yml"

    def _normalize_stack_id(self, file_name: str) -> str:
        normalized = file_name.strip()
        if normalized.endswith(".yml"):
            normalized = normalized[:-4]
        elif normalized.endswith(".yaml"):
            normalized = normalized[:-5]
        if not normalized or not STACK_ID_RE.match(normalized):
            raise ValueError("file_name must use only letters, numbers, dots, underscores, or dashes")
        return normalized

    def _slugify_name(self, name: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
        return slug or "stack"

    def _next_available_stack_id(
        self, repo_path: Path, preferred_id: str, *, ignore_id: str | None = None
    ) -> str:
        candidate = preferred_id
        suffix = 2
        while True:
            path = self._stack_path(repo_path, candidate)
            if candidate == ignore_id or not path.exists():
                return candidate
            candidate = f"{preferred_id}-{suffix}"
            suffix += 1

    def _load_action_catalog(self, repo_path: Path) -> dict[str, Action]:
        """Scan .racksmith/actions/ and parse all action.yaml files."""
        actions: dict[str, Action] = {}
        actions_dir = repo_path / ACTIONS_DIR
        if not actions_dir.is_dir():
            return actions
        for action_dir in sorted(actions_dir.iterdir()):
            manifest = action_dir / "action.yaml"
            if not manifest.is_file():
                manifest = action_dir / "action.yml"
            if not manifest.is_file():
                continue
            try:
                data = yaml.safe_load(manifest.read_text())
                cfg = ActionConfig.model_validate(data)
            except Exception:
                continue
            actions[cfg.slug] = Action(
                slug=cfg.slug,
                name=cfg.name,
                description=cfg.description,
                inputs=[ActionInput(**i.model_dump()) for i in cfg.inputs],
                labels=cfg.labels,
            )
        return actions

    def actions(self, session) -> list[Action]:
        repo_path = repos_manager.active_repo_path(session)
        return list(self._load_action_catalog(repo_path).values())

    def _serialize_stack_yaml(
        self, body: StackUpsertRequest, action_catalog: dict[str, Action]
    ) -> str:
        roles: list[Any] = []
        for role in body.roles:
            action = action_catalog.get(role.action_slug)
            if action is None:
                raise ValueError(f"Unknown action: {role.action_slug}")
            default_vars = {
                inp.key: inp.default
                for inp in action.inputs
                if inp.default is not None
            }
            merged_vars = {**default_vars, **role.vars}
            if merged_vars:
                roles.append({"role": role.action_slug, "vars": merged_vars})
            else:
                roles.append(role.action_slug)

        play: dict[str, Any] = {
            "name": body.name.strip(),
            "hosts": "all",
            "gather_facts": False,
            "become": body.become,
            "roles": roles,
        }
        if body.description.strip():
            play["vars"] = {RESERVED_DESCRIPTION_KEY: body.description.strip()}
        return yaml.safe_dump([play], sort_keys=False)

    def _parse_stack_file(self, path: Path) -> tuple[StackSummary, list[StackRoleInput], str]:
        raw = path.read_text(encoding="utf-8")
        payload = yaml.safe_load(raw)
        if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
            raise ValueError("Stack must contain a YAML list with one play")

        play = payload[0]
        if not isinstance(play.get("roles"), list):
            raise ValueError("Stack roles must be a list")

        description = ""
        vars_block = play.get("vars")
        if isinstance(vars_block, dict):
            description_value = vars_block.get(RESERVED_DESCRIPTION_KEY)
            if isinstance(description_value, str):
                description = description_value

        role_entries: list[StackRoleInput] = []
        role_ids: list[str] = []
        for entry in play.get("roles", []):
            role_name = ""
            role_vars: dict[str, Any] = {}
            if isinstance(entry, str):
                role_name = entry
            elif isinstance(entry, dict):
                role_value = entry.get("role")
                if isinstance(role_value, str):
                    role_name = role_value
                role_vars_value = entry.get("vars")
                if isinstance(role_vars_value, dict):
                    role_vars = role_vars_value
            action_slug = role_name
            role_entries.append(StackRoleInput(action_slug=action_slug, vars=role_vars))
            role_ids.append(action_slug)

        stat = path.stat()
        summary = StackSummary(
            id=path.stem,
            file_name=path.name,
            path=str(STACKS_DIR / path.name),
            name=str(play.get("name") or path.stem),
            description=description,
            become=bool(play.get("become", False)),
            roles=role_ids,
            updated_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
        )
        return summary, role_entries, raw

    def list_stacks(self, session) -> list[StackSummary]:
        repo_path = repos_manager.active_repo_path(session)
        stacks_dir = self._stacks_dir(repo_path)
        if not stacks_dir.is_dir():
            return []

        results: list[StackSummary] = []
        for path in sorted(stacks_dir.glob("*.yml")):
            try:
                summary, _, _ = self._parse_stack_file(path)
            except (OSError, ValueError, yaml.YAMLError):
                continue
            results.append(summary)
        return sorted(results, key=lambda s: s.file_name.lower())

    def get_stack(self, session, stack_id: str) -> StackDetail:
        repo_path = repos_manager.active_repo_path(session)
        path = self._stack_path(repo_path, stack_id)
        if not path.is_file():
            raise FileNotFoundError("Stack not found")
        summary, role_entries, raw = self._parse_stack_file(path)
        action_catalog = self._load_action_catalog(repo_path)
        return StackDetail(
            **summary.model_dump(),
            actions=list(action_catalog.values()),
            role_entries=role_entries,
            raw_content=raw,
        )

    def create_stack(self, session, body: StackUpsertRequest) -> StackDetail:
        repo_path = repos_manager.active_repo_path(session)
        action_catalog = self._load_action_catalog(repo_path)
        stack_id = (
            self._normalize_stack_id(body.file_name)
            if body.file_name.strip()
            else self._next_available_stack_id(
                repo_path,
                self._slugify_name(body.name),
            )
        )
        path = self._stack_path(repo_path, stack_id)
        if path.exists():
            raise ValueError("Stack already exists")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self._serialize_stack_yaml(body, action_catalog), encoding="utf-8")
        return self.get_stack(session, stack_id)

    def update_stack(self, session, stack_id: str, body: StackUpsertRequest) -> StackDetail:
        repo_path = repos_manager.active_repo_path(session)
        action_catalog = self._load_action_catalog(repo_path)
        path = self._stack_path(repo_path, stack_id)
        if not path.is_file():
            raise FileNotFoundError("Stack not found")

        next_id = (
            self._normalize_stack_id(body.file_name)
            if body.file_name.strip()
            else stack_id
        )
        next_path = self._stack_path(repo_path, next_id)
        if next_path != path and next_path.exists():
            raise ValueError("Another stack already uses that file name")

        next_path.parent.mkdir(parents=True, exist_ok=True)
        next_path.write_text(self._serialize_stack_yaml(body, action_catalog), encoding="utf-8")
        if next_path != path:
            path.unlink(missing_ok=True)
        return self.get_stack(session, next_id)

    def delete_stack(self, session, stack_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._stack_path(repo_path, stack_id)
        if not path.is_file():
            raise FileNotFoundError("Stack not found")
        path.unlink(missing_ok=True)

    def resolve_targets(
        self, session, targets: StackTargetSelection
    ) -> StackResolveTargetsResponse:
        try:
            all_nodes = node_manager.list_nodes(session)
        except FileNotFoundError:
            return StackResolveTargetsResponse(hosts=[])

        managed = [n for n in all_nodes if n.managed and n.ip_address and n.ssh_user]
        filtered = managed

        wanted_groups = {g.strip() for g in targets.groups if g.strip()}
        if wanted_groups:
            filtered = [
                n for n in filtered
                if wanted_groups.intersection(set(n.groups))
            ]

        wanted_labels = {t.strip() for t in targets.labels if t.strip()}
        if wanted_labels:
            filtered = [
                n for n in filtered
                if wanted_labels.issubset(set(n.labels))
            ]

        wanted_nodes = {s.strip() for s in targets.nodes if s.strip()}
        if wanted_nodes:
            filtered = [n for n in filtered if n.id in wanted_nodes]

        hosts = sorted({n.id for n in filtered})
        return StackResolveTargetsResponse(hosts=hosts)

    async def list_runs(self, session, stack_id: str | None = None) -> list[StackRun]:
        user_id = user_storage_id(session.user)
        db = _get_db()
        if stack_id:
            cursor = await db.execute(
                "SELECT * FROM runs WHERE user_id = ? AND stack_id = ? ORDER BY created_at DESC",
                (user_id, stack_id),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        rows = await cursor.fetchall()
        return [row_to_stack_run(row) for row in rows]

    async def get_run(self, session, run_id: str) -> StackRun:
        user_id = user_storage_id(session.user)
        db = _get_db()
        cursor = await db.execute(
            "SELECT * FROM runs WHERE id = ? AND user_id = ?",
            (run_id, user_id),
        )
        row = await cursor.fetchone()
        if row is None:
            raise KeyError("Run not found")
        return row_to_stack_run(row)

    async def create_run(self, session, stack_id: str, body: StackRunRequest) -> StackRun:
        repo_path = repos_manager.active_repo_path(session)
        stack = self.get_stack(session, stack_id)
        hosts = self.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        user_id = user_storage_id(session.user)
        commit_sha = get_head_sha(repo_path)
        run = StackRun(
            id=_new_id(),
            stack_id=stack.id,
            stack_name=stack.name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
            commit_sha=commit_sha,
        )
        db = _get_db()
        await db.execute(
            """INSERT INTO runs (id, user_id, stack_id, stack_name, status, created_at, hosts, output, commit_sha)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (run.id, user_id, run.stack_id, run.stack_name, run.status, run.created_at, json.dumps(run.hosts), run.output, run.commit_sha),
        )
        await db.commit()

        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        await self._arq_pool.enqueue_job(
            "execute_run",
            run_id=run.id,
            repo_path=str(repo_path),
            stack_id=stack.id,
            hosts=hosts,
            runtime_vars=body.runtime_vars or {},
            become_password=body.become_password,
        )
        return run

    async def stream_run(self, session, run_id: str, websocket) -> None:
        run = await self.get_run(session, run_id)
        if run.status in ("completed", "failed"):
            await websocket.send_json({"type": "snapshot", "run": run.model_dump(), "done": True})
            return

        channel = f"{RUN_EVENTS_CHANNEL_PREFIX}{run_id}:events"
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis_client.pubsub()
        try:
            await pubsub.subscribe(channel)
            await websocket.send_json({"type": "snapshot", "run": run.model_dump()})
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                if message is None:
                    # Re-check DB in case we subscribed after worker already finished
                    run = await self.get_run(session, run_id)
                    if run.status in ("completed", "failed"):
                        await websocket.send_json({"type": "snapshot", "run": run.model_dump(), "done": True})
                        break
                    continue
                if message["type"] != "message":
                    continue
                payload = json.loads(message["data"])
                if payload.get("type") == "output":
                    await websocket.send_json(payload)
                elif payload.get("type") == "status":
                    run = await self.get_run(session, run_id)
                    await websocket.send_json({"type": "status", "run": run.model_dump()})
                elif payload.get("type") == "done":
                    run = await self.get_run(session, run_id)
                    await websocket.send_json({"type": "snapshot", "run": run.model_dump(), "done": True})
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await redis_client.aclose()


stack_manager = StackManager()
