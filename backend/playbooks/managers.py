"""Playbook management, generation, and execution."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import UTC, datetime
from pathlib import Path

import redis.asyncio as aioredis
import settings
from ansible import resolve_layout
from github.misc import RepoNotAvailableError
from ansible.playbooks import (
    PlaybookData,
    PlaybookRoleEntry as AnsiblePlaybookRoleEntry,
    read_playbook,
    list_playbooks,
    remove_playbook,
    write_playbook,
)
from ansible.roles import RoleData, list_roles

from _utils.db import _get_db, row_to_playbook_run
from github.misc import get_head_sha, user_storage_id
from hosts.managers import host_manager
from repos.managers import repos_manager

from playbooks.schemas import (
    PlaybookDetail,
    PlaybookRoleEntry,
    PlaybookRun,
    PlaybookRunRequest,
    PlaybookSummary,
    PlaybookUpsertRequest,
    ResolveTargetsResponse,
    TargetSelection,
)

RUN_EVENTS_CHANNEL_PREFIX = "racksmith:run:"


def _generate_playbook_id(repo_path: Path, layout) -> str:
    existing = {p.id for p in list_playbooks(layout)}
    for _ in range(100):
        candidate = f"s_{secrets.token_hex(3)}"
        if candidate not in existing:
            return candidate
    raise RuntimeError("Failed to generate unique playbook ID")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _role_data_to_catalog(r: RoleData) -> dict:
    """Convert RoleData to RoleCatalogEntry dict."""
    return {
        "slug": r.slug,
        "name": r.name,
        "description": r.description,
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
            for inp in r.inputs
        ],
        "labels": r.tags,
    }


class PlaybookManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    def roles_catalog(self, session) -> list[dict]:
        """List all roles for catalog display."""
        try:
            repo_path = repos_manager.active_repo_path(session)
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
        return [_role_data_to_catalog(r) for r in list_roles(layout)]

    def list_playbooks(self, session) -> list[PlaybookSummary]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except RepoNotAvailableError:
            return []
        layout = resolve_layout(repo_path)
        playbooks_data = list_playbooks(layout)
        results: list[PlaybookSummary] = []
        for p in playbooks_data:
            path_str = str(p.path) if p.path else ""
            full_path = (
                p.path
                if (p.path and p.path.is_absolute())
                else (
                    layout.repo_path / p.path
                    if p.path
                    else layout.playbooks_path / f"{p.id}.yml"
                )
            )
            mtime = full_path.stat().st_mtime if full_path.exists() else 0
            results.append(
                PlaybookSummary(
                    id=p.id,
                    path=path_str,
                    name=p.name,
                    description=p.description,
                    roles=[re.role for re in p.roles],
                    updated_at=datetime.fromtimestamp(mtime, tz=UTC).isoformat()
                    if mtime
                    else _now_iso(),
                )
            )
        return sorted(results, key=lambda s: (s.name.lower(), s.id))

    def get_playbook(self, session, playbook_id: str) -> PlaybookDetail:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        p = read_playbook(playbook_path, layout.repo_path)
        roles_catalog = [r for r in list_roles(layout)]
        role_entries = [
            PlaybookRoleEntry(role_slug=re.role, vars=re.vars or {})
            for re in p.roles
        ]
        path_str = str(p.path) if p.path else ""
        return PlaybookDetail(
            id=p.id,
            path=path_str,
            name=p.name,
            description=p.description,
            roles=[re.role for re in p.roles],
            updated_at=datetime.fromtimestamp(
                playbook_path.stat().st_mtime, tz=UTC
            ).isoformat(),
            roles_catalog=[_role_data_to_catalog(r) for r in roles_catalog],
            role_entries=role_entries,
            raw_content=p.raw_content,
        )

    def create_playbook(self, session, body: PlaybookUpsertRequest) -> PlaybookDetail:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        roles_catalog = {r.slug: r for r in list_roles(layout)}
        playbook_id = _generate_playbook_id(repo_path, layout)
        ansible_roles: list[AnsiblePlaybookRoleEntry] = []
        for re in body.roles:
            if re.role_slug not in roles_catalog:
                raise ValueError(f"Unknown role: {re.role_slug}")
            ansible_roles.append(
                AnsiblePlaybookRoleEntry(role=re.role_slug, vars=re.vars)
            )
        playbook_data = PlaybookData(
            id=playbook_id,
            path=layout.playbooks_path / f"{playbook_id}.yml",
            name=body.name.strip(),
            description=body.description.strip(),
            hosts="all",
            gather_facts=True,
            become=False,
            roles=ansible_roles,
            raw_content="",
        )
        write_playbook(layout, playbook_data)
        return self.get_playbook(session, playbook_id)

    def update_playbook(
        self, session, playbook_id: str, body: PlaybookUpsertRequest
    ) -> PlaybookDetail:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        roles_catalog = {r.slug: r for r in list_roles(layout)}
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        ansible_roles: list[AnsiblePlaybookRoleEntry] = []
        for re in body.roles:
            if re.role_slug not in roles_catalog:
                raise ValueError(f"Unknown role: {re.role_slug}")
            ansible_roles.append(
                AnsiblePlaybookRoleEntry(role=re.role_slug, vars=re.vars)
            )
        playbook_data = PlaybookData(
            id=playbook_id,
            path=playbook_path,
            name=body.name.strip(),
            description=body.description.strip(),
            hosts="all",
            gather_facts=True,
            become=False,
            roles=ansible_roles,
            raw_content="",
        )
        write_playbook(layout, playbook_data)
        return self.get_playbook(session, playbook_id)

    def delete_playbook(self, session, playbook_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        remove_playbook(layout, playbook_id)

    def resolve_targets(
        self, session, targets: TargetSelection
    ) -> ResolveTargetsResponse:
        try:
            all_hosts = host_manager.list_hosts(session)
        except FileNotFoundError:
            return ResolveTargetsResponse(hosts=[])

        managed = [
            h
            for h in all_hosts
            if h.managed and h.ip_address and h.ssh_user
        ]
        filtered = managed

        wanted_groups = {g.strip() for g in targets.groups if g.strip()}
        if wanted_groups:
            filtered = [
                h for h in filtered
                if wanted_groups.intersection(set(h.groups))
            ]

        wanted_labels = {t.strip() for t in targets.labels if t.strip()}
        if wanted_labels:
            filtered = [
                h for h in filtered
                if wanted_labels.issubset(set(h.labels))
            ]

        wanted_hosts = {s.strip() for s in targets.hosts if s.strip()}
        if wanted_hosts:
            filtered = [h for h in filtered if h.id in wanted_hosts]

        wanted_racks = {r.strip() for r in targets.racks if r.strip()}
        if wanted_racks:
            filtered = [
                h for h in filtered
                if h.placement and h.placement.rack in wanted_racks
            ]

        hosts = sorted({h.id for h in filtered})
        return ResolveTargetsResponse(hosts=hosts)

    async def list_runs(
        self, session, playbook_id: str | None = None
    ) -> list[PlaybookRun]:
        user_id = user_storage_id(session.user)
        db = _get_db()
        if playbook_id:
            cursor = await db.execute(
                "SELECT * FROM playbook_runs WHERE user_id = ? AND playbook_id = ? ORDER BY created_at DESC",
                (user_id, playbook_id),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM playbook_runs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        rows = await cursor.fetchall()
        from _utils.db import row_to_playbook_run
        return [row_to_playbook_run(row) for row in rows]

    async def get_run(self, session, run_id: str) -> PlaybookRun:
        user_id = user_storage_id(session.user)
        db = _get_db()
        cursor = await db.execute(
            "SELECT * FROM playbook_runs WHERE id = ? AND user_id = ?",
            (run_id, user_id),
        )
        row = await cursor.fetchone()
        if row is None:
            raise KeyError("Run not found")
        from _utils.db import row_to_playbook_run
        return row_to_playbook_run(row)

    async def create_run(
        self, session, playbook_id: str, body: PlaybookRunRequest
    ) -> PlaybookRun:
        repo_path = repos_manager.active_repo_path(session)
        playbook = self.get_playbook(session, playbook_id)
        hosts = self.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        user_id = user_storage_id(session.user)
        commit_sha = get_head_sha(repo_path)
        run = PlaybookRun(
            id=_new_id(),
            playbook_id=playbook.id,
            playbook_name=playbook.name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
            commit_sha=commit_sha,
        )
        db = _get_db()
        await db.execute(
            """INSERT INTO playbook_runs (id, user_id, playbook_id, playbook_name, status, created_at, hosts, output, commit_sha)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run.id,
                user_id,
                run.playbook_id,
                run.playbook_name,
                run.status,
                run.created_at,
                json.dumps(run.hosts),
                run.output,
                run.commit_sha,
            ),
        )
        await db.commit()

        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        await self._arq_pool.enqueue_job(
            "execute_playbook_run",
            run_id=run.id,
            repo_path=str(repo_path),
            playbook_id=playbook.id,
            hosts=hosts,
            runtime_vars=body.runtime_vars or {},
            become=body.become,
            become_password=body.become_password,
        )
        return run

    async def stream_run(self, session, run_id: str, websocket) -> None:
        run = await self.get_run(session, run_id)
        if run.status in ("completed", "failed"):
            await websocket.send_json(
                {"type": "snapshot", "run": run.model_dump(), "done": True}
            )
            return

        channel = f"{RUN_EVENTS_CHANNEL_PREFIX}{run_id}:events"
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


playbook_manager = PlaybookManager()
