"""Playbook management, generation, and execution."""

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
from _utils.db import _get_db, row_to_playbook_run
from github.misc import get_head_sha, user_storage_id
from playbooks.role_templates import BUILTIN_ROLE_PREFIX, ROLE_TEMPLATE_SPECS
from nodes.managers import node_manager
from setup.managers import setup_manager

from playbooks.schemas import (
    PlaybookDetail,
    PlaybookResolveTargetsResponse,
    PlaybookRoleInput,
    PlaybookRun,
    PlaybookRunRequest,
    PlaybookSummary,
    PlaybookTargetSelection,
    PlaybookUpsertRequest,
    RoleTemplate,
)

PLAYBOOKS_DIR = Path(".racksmith/playbooks")
ROLES_DIR = PLAYBOOKS_DIR / "roles"
LEGACY_ROLES_DIR = Path("ansible_scripts/roles")
INVENTORY_DIR = Path(".racksmith/inventory")
RESERVED_DESCRIPTION_KEY = "racksmith_description"
RUN_EVENTS_CHANNEL_PREFIX = "racksmith:run:"
PLAYBOOK_ID_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class PlaybookManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    def _playbooks_dir(self, repo_path: Path) -> Path:
        return repo_path / PLAYBOOKS_DIR

    def _roles_dir(self, repo_path: Path) -> Path:
        return repo_path / ROLES_DIR

    def _legacy_roles_dir(self, repo_path: Path) -> Path:
        return repo_path / LEGACY_ROLES_DIR

    def _inventory_dir(self, repo_path: Path) -> Path:
        return repo_path / INVENTORY_DIR

    def _playbook_path(self, repo_path: Path, playbook_id: str) -> Path:
        return self._playbooks_dir(repo_path) / f"{playbook_id}.yml"

    def _normalize_playbook_id(self, file_name: str) -> str:
        normalized = file_name.strip()
        if normalized.endswith(".yml"):
            normalized = normalized[:-4]
        elif normalized.endswith(".yaml"):
            normalized = normalized[:-5]
        if not normalized or not PLAYBOOK_ID_RE.match(normalized):
            raise ValueError("file_name must use only letters, numbers, dots, underscores, or dashes")
        return normalized

    def _slugify_play_name(self, play_name: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", play_name.strip().lower()).strip("-")
        return slug or "playbook"

    def _next_available_playbook_id(
        self, repo_path: Path, preferred_id: str, *, ignore_id: str | None = None
    ) -> str:
        candidate = preferred_id
        suffix = 2
        while True:
            path = self._playbook_path(repo_path, candidate)
            if candidate == ignore_id or not path.exists():
                return candidate
            candidate = f"{preferred_id}-{suffix}"
            suffix += 1

    def _ensure_builtin_role_templates(self, repo_path: Path) -> None:
        roles_dir = self._roles_dir(repo_path)
        for spec in ROLE_TEMPLATE_SPECS.values():
            for relative_path, content in spec.files.items():
                file_path = roles_dir / spec.role_name / relative_path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")

        # Clean up stale generated roles from the old ansible_scripts/roles location
        # while leaving any user-managed roles untouched.
        legacy_roles_dir = self._legacy_roles_dir(repo_path)
        if legacy_roles_dir.is_dir():
            for child in legacy_roles_dir.iterdir():
                if child.is_dir() and child.name.startswith(BUILTIN_ROLE_PREFIX):
                    for nested in sorted(child.rglob("*"), reverse=True):
                        if nested.is_file():
                            nested.unlink(missing_ok=True)
                        elif nested.is_dir():
                            nested.rmdir()
                    child.rmdir()
            try:
                next(legacy_roles_dir.iterdir())
            except StopIteration:
                legacy_roles_dir.rmdir()

    def role_templates(self) -> list[RoleTemplate]:
        return [spec.template for spec in ROLE_TEMPLATE_SPECS.values()]

    def _serialize_playbook_yaml(self, body: PlaybookUpsertRequest) -> str:
        roles: list[Any] = []
        for role in body.roles:
            spec = ROLE_TEMPLATE_SPECS.get(role.template_id)
            if spec is None:
                raise ValueError(f"Unknown role template: {role.template_id}")
            default_vars = {
                field.key: field.default
                for field in spec.template.fields
                if field.default is not None
            }
            merged_vars = {
                **default_vars,
                **role.vars,
            }
            if merged_vars:
                roles.append({"role": spec.role_name, "vars": merged_vars})
            else:
                roles.append(spec.role_name)

        play: dict[str, Any] = {
            "name": body.play_name.strip(),
            "hosts": "all",
            "gather_facts": False,
            "become": body.become,
            "roles": roles,
        }
        if body.description.strip():
            play["vars"] = {RESERVED_DESCRIPTION_KEY: body.description.strip()}
        return yaml.safe_dump([play], sort_keys=False)

    def _parse_playbook_file(self, path: Path) -> tuple[PlaybookSummary, list[PlaybookRoleInput], str]:
        raw = path.read_text(encoding="utf-8")
        payload = yaml.safe_load(raw)
        if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
            raise ValueError("Playbook must contain a YAML list with one play")

        play = payload[0]
        if not isinstance(play.get("roles"), list):
            raise ValueError("Playbook roles must be a list")

        description = ""
        vars_block = play.get("vars")
        if isinstance(vars_block, dict):
            description_value = vars_block.get(RESERVED_DESCRIPTION_KEY)
            if isinstance(description_value, str):
                description = description_value

        role_entries: list[PlaybookRoleInput] = []
        role_ids: list[str] = []
        reverse_role_names = {
            spec.role_name: spec.template.id for spec in ROLE_TEMPLATE_SPECS.values()
        }
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
            template_id = reverse_role_names.get(role_name)
            if template_id:
                role_entries.append(PlaybookRoleInput(template_id=template_id, vars=role_vars))
                role_ids.append(template_id)

        stat = path.stat()
        summary = PlaybookSummary(
            id=path.stem,
            file_name=path.name,
            path=str(PLAYBOOKS_DIR / path.name),
            play_name=str(play.get("name") or path.stem),
            description=description,
            become=bool(play.get("become", False)),
            roles=role_ids,
            updated_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
        )
        return summary, role_entries, raw

    def list_playbooks(self, session) -> list[PlaybookSummary]:
        repo_path = setup_manager.active_repo_path(session)
        self._ensure_builtin_role_templates(repo_path)
        playbooks_dir = self._playbooks_dir(repo_path)
        if not playbooks_dir.is_dir():
            return []

        results: list[PlaybookSummary] = []
        for path in sorted(playbooks_dir.glob("*.yml")):
            try:
                summary, _, _ = self._parse_playbook_file(path)
            except (OSError, ValueError, yaml.YAMLError):
                continue
            results.append(summary)
        return sorted(results, key=lambda playbook: playbook.file_name.lower())

    def get_playbook(self, session, playbook_id: str) -> PlaybookDetail:
        repo_path = setup_manager.active_repo_path(session)
        self._ensure_builtin_role_templates(repo_path)
        path = self._playbook_path(repo_path, playbook_id)
        if not path.is_file():
            raise FileNotFoundError("Playbook not found")
        summary, role_entries, raw = self._parse_playbook_file(path)
        return PlaybookDetail(
            **summary.model_dump(),
            role_templates=self.role_templates(),
            role_entries=role_entries,
            raw_content=raw,
        )

    def create_playbook(self, session, body: PlaybookUpsertRequest) -> PlaybookDetail:
        repo_path = setup_manager.active_repo_path(session)
        self._ensure_builtin_role_templates(repo_path)
        playbook_id = (
            self._normalize_playbook_id(body.file_name)
            if body.file_name.strip()
            else self._next_available_playbook_id(
                repo_path,
                self._slugify_play_name(body.play_name),
            )
        )
        path = self._playbook_path(repo_path, playbook_id)
        if path.exists():
            raise ValueError("Playbook already exists")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self._serialize_playbook_yaml(body), encoding="utf-8")
        return self.get_playbook(session, playbook_id)

    def update_playbook(self, session, playbook_id: str, body: PlaybookUpsertRequest) -> PlaybookDetail:
        repo_path = setup_manager.active_repo_path(session)
        self._ensure_builtin_role_templates(repo_path)
        path = self._playbook_path(repo_path, playbook_id)
        if not path.is_file():
            raise FileNotFoundError("Playbook not found")

        next_id = (
            self._normalize_playbook_id(body.file_name)
            if body.file_name.strip()
            else playbook_id
        )
        next_path = self._playbook_path(repo_path, next_id)
        if next_path != path and next_path.exists():
            raise ValueError("Another playbook already uses that file name")

        next_path.parent.mkdir(parents=True, exist_ok=True)
        next_path.write_text(self._serialize_playbook_yaml(body), encoding="utf-8")
        if next_path != path:
            path.unlink(missing_ok=True)
        return self.get_playbook(session, next_id)

    def delete_playbook(self, session, playbook_id: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        path = self._playbook_path(repo_path, playbook_id)
        if not path.is_file():
            raise FileNotFoundError("Playbook not found")
        path.unlink(missing_ok=True)

    def resolve_targets(
        self, session, targets: PlaybookTargetSelection
    ) -> PlaybookResolveTargetsResponse:
        try:
            all_nodes = node_manager.list_nodes(session)
        except FileNotFoundError:
            return PlaybookResolveTargetsResponse(hosts=[])

        managed = [n for n in all_nodes if n.managed and n.host and n.ssh_user]
        filtered = managed

        wanted_groups = {g.strip() for g in targets.groups if g.strip()}
        if wanted_groups:
            filtered = [
                n for n in filtered
                if wanted_groups.intersection(set(n.groups))
            ]

        wanted_tags = {t.strip() for t in targets.tags if t.strip()}
        if wanted_tags:
            filtered = [
                n for n in filtered
                if wanted_tags.issubset(set(n.tags))
            ]

        wanted_nodes = {s.strip() for s in targets.nodes if s.strip()}
        if wanted_nodes:
            filtered = [n for n in filtered if n.slug in wanted_nodes]

        hosts = sorted({n.slug for n in filtered})
        return PlaybookResolveTargetsResponse(hosts=hosts)

    async def list_runs(self, session, playbook_id: str | None = None) -> list[PlaybookRun]:
        user_id = user_storage_id(session.user)
        db = _get_db()
        if playbook_id:
            cursor = await db.execute(
                "SELECT * FROM runs WHERE user_id = ? AND playbook_id = ? ORDER BY created_at DESC",
                (user_id, playbook_id),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        rows = await cursor.fetchall()
        return [row_to_playbook_run(row) for row in rows]

    async def get_run(self, session, run_id: str) -> PlaybookRun:
        user_id = user_storage_id(session.user)
        db = _get_db()
        cursor = await db.execute(
            "SELECT * FROM runs WHERE id = ? AND user_id = ?",
            (run_id, user_id),
        )
        row = await cursor.fetchone()
        if row is None:
            raise KeyError("Run not found")
        return row_to_playbook_run(row)

    async def create_run(self, session, playbook_id: str, body: PlaybookRunRequest) -> PlaybookRun:
        repo_path = setup_manager.active_repo_path(session)
        playbook = self.get_playbook(session, playbook_id)
        hosts = self.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        user_id = user_storage_id(session.user)
        commit_sha = get_head_sha(repo_path)
        run = PlaybookRun(
            id=_new_id(),
            playbook_id=playbook.id,
            playbook_name=playbook.play_name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
            commit_sha=commit_sha,
        )
        db = _get_db()
        await db.execute(
            """INSERT INTO runs (id, user_id, playbook_id, playbook_name, status, created_at, hosts, output, commit_sha)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (run.id, user_id, run.playbook_id, run.playbook_name, run.status, run.created_at, json.dumps(run.hosts), run.output, run.commit_sha),
        )
        await db.commit()

        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        await self._arq_pool.enqueue_job(
            "execute_run",
            run_id=run.id,
            repo_path=str(repo_path),
            playbook_id=playbook.id,
            hosts=hosts,
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


playbook_manager = PlaybookManager()
