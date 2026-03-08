"""Action CRUD — create/list/delete user actions in .racksmith/actions/."""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
import redis.asyncio as aioredis

import settings
from _utils.db import _get_db, row_to_action_run
from github.misc import RACKSMITH_BRANCH, get_head_sha, run_git, user_storage_id
from repos.managers import repos_manager
from schema.models.action import ActionConfig
from stacks.managers import stack_manager

from actions.schemas import (
    ActionCreateRequest,
    ActionDetailResponse,
    ActionResponse,
    ActionRun,
    ActionRunRequest,
    ActionUpdateRequest,
)

ACTIONS_DIR = Path(".racksmith/actions")
INVENTORY_DIR = Path(".racksmith/inventory")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
RUN_EVENTS_CHANNEL_PREFIX = "racksmith:run:"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _validate_slug(slug: str) -> None:
    if not SLUG_RE.match(slug):
        raise ValueError(
            "slug must be lowercase letters, numbers, hyphens, or underscores "
            "and must start with a letter or number"
        )


def _action_dir(repo_path: Path, slug: str) -> Path:
    return repo_path / ACTIONS_DIR / slug


def _read_action(action_dir: Path) -> ActionResponse | None:
    manifest = action_dir / "action.yaml"
    if not manifest.is_file():
        manifest = action_dir / "action.yml"
    if not manifest.is_file():
        return None
    try:
        data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
        cfg = ActionConfig.model_validate(data)
    except Exception:
        return None
    tasks_file = action_dir / "tasks" / "main.yml"
    return ActionResponse(
        slug=cfg.slug,
        name=cfg.name,
        description=cfg.description,
        source=cfg.source,
        inputs=[i.model_dump() for i in cfg.inputs],
        labels=cfg.labels,
        compatibility=cfg.compatibility.model_dump(),
        has_tasks=tasks_file.is_file(),
    )


def _read_action_detail(action_dir: Path) -> ActionDetailResponse | None:
    manifest = action_dir / "action.yaml"
    if not manifest.is_file():
        manifest = action_dir / "action.yml"
    if not manifest.is_file():
        return None
    try:
        manifest_text = manifest.read_text(encoding="utf-8")
        data = yaml.safe_load(manifest_text)
        cfg = ActionConfig.model_validate(data)
    except Exception:
        return None

    tasks_file = action_dir / "tasks" / "main.yml"
    tasks_content = ""
    if tasks_file.is_file():
        tasks_content = tasks_file.read_text(encoding="utf-8")

    combined: dict[str, Any] = data.copy()
    if tasks_content:
        try:
            combined["tasks"] = yaml.safe_load(tasks_content)
        except Exception:
            combined["tasks"] = []
    raw_content = yaml.safe_dump(combined, sort_keys=False, allow_unicode=True)

    return ActionDetailResponse(
        slug=cfg.slug,
        name=cfg.name,
        description=cfg.description,
        source=cfg.source,
        inputs=[i.model_dump() for i in cfg.inputs],
        labels=cfg.labels,
        compatibility=cfg.compatibility.model_dump(),
        has_tasks=tasks_file.is_file(),
        raw_content=raw_content,
        tasks_content=tasks_content,
    )


class ActionManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    # ── CRUD ──────────────────────────────────────────────────────────

    def list_actions(self, session) -> list[ActionResponse]:
        repo_path = repos_manager.active_repo_path(session)
        actions_dir = repo_path / ACTIONS_DIR
        if not actions_dir.is_dir():
            return []
        results: list[ActionResponse] = []
        for d in sorted(actions_dir.iterdir()):
            if not d.is_dir():
                continue
            action = _read_action(d)
            if action is not None:
                results.append(action)
        return results

    def get_action(self, session, slug: str) -> ActionResponse:
        repo_path = repos_manager.active_repo_path(session)
        action = _read_action(_action_dir(repo_path, slug))
        if action is None:
            raise FileNotFoundError(f"Action '{slug}' not found")
        return action

    def get_action_detail(self, session, slug: str) -> ActionDetailResponse:
        repo_path = repos_manager.active_repo_path(session)
        detail = _read_action_detail(_action_dir(repo_path, slug))
        if detail is None:
            raise FileNotFoundError(f"Action '{slug}' not found")
        return detail

    def create_action(self, session, body: ActionCreateRequest) -> ActionResponse:
        _validate_slug(body.slug)
        repo_path = repos_manager.active_repo_path(session)
        dest = _action_dir(repo_path, body.slug)
        if dest.exists():
            raise ValueError(f"Action '{body.slug}' already exists")

        manifest_data = body.model_dump(exclude={"tasks"})
        manifest_data["source"] = "user"

        dest.mkdir(parents=True, exist_ok=True)
        (dest / "action.yaml").write_text(
            yaml.safe_dump(manifest_data, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

        tasks_dir = dest / "tasks"
        tasks_dir.mkdir(exist_ok=True)
        tasks_content = (
            yaml.safe_dump(body.tasks, sort_keys=False, allow_unicode=True)
            if body.tasks
            else "---\n# Add your Ansible tasks here\n"
        )
        (tasks_dir / "main.yml").write_text(tasks_content, encoding="utf-8")

        action = _read_action(dest)
        if action is None:
            raise RuntimeError("Action was written but could not be read back")

        self._commit_action(session, repo_path, dest, body.slug)
        return action

    def update_action(self, session, slug: str, body: ActionUpdateRequest) -> ActionDetailResponse:
        repo_path = repos_manager.active_repo_path(session)
        dest = _action_dir(repo_path, slug)
        if not dest.exists():
            raise FileNotFoundError(f"Action '{slug}' not found")

        manifest = dest / "action.yaml"
        if not manifest.is_file():
            manifest = dest / "action.yml"
        if manifest.is_file():
            old_data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
            if old_data.get("source") == "builtin":
                raise ValueError("Cannot edit a built-in action")

        try:
            data = yaml.safe_load(body.yaml_text)
        except yaml.YAMLError as exc:
            raise ValueError(f"Invalid YAML: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("YAML must be a mapping (dict)")

        tasks_list = data.pop("tasks", None)

        data["slug"] = slug
        cfg = ActionConfig.model_validate(data)

        manifest_data = data.copy()
        manifest_out = dest / "action.yaml"
        manifest_out.write_text(
            yaml.safe_dump(manifest_data, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

        tasks_dir = dest / "tasks"
        tasks_dir.mkdir(exist_ok=True)
        if tasks_list is not None:
            tasks_content = yaml.safe_dump(tasks_list, sort_keys=False, allow_unicode=True)
        else:
            tasks_content = "---\n# Add your Ansible tasks here\n"
        (tasks_dir / "main.yml").write_text(tasks_content, encoding="utf-8")

        detail = _read_action_detail(dest)
        if detail is None:
            raise RuntimeError("Action was written but could not be read back")

        self._commit_action(session, repo_path, dest, slug, message=f"Update action: {slug}")
        return detail

    def _commit_action(
        self, session, repo_path: Path, action_dir: Path, slug: str, *, message: str | None = None,
    ) -> None:
        """Stage only this action's directory and push to the racksmith branch."""
        binding = repos_manager.current_repo(session)
        if not binding:
            return
        rel = action_dir.relative_to(repo_path)
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["add", str(rel)])
        result = run_git(
            repo_path,
            [
                "-c",
                f"user.name={settings.GIT_COMMIT_USER_NAME}",
                "-c",
                f"user.email={settings.GIT_COMMIT_USER_EMAIL}",
                "commit",
                "-m",
                message or f"Add action: {slug}",
            ],
            check=False,
        )
        if result.returncode == 0:
            run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH], check=False)

    def delete_action(self, session, slug: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        dest = _action_dir(repo_path, slug)
        if not dest.exists():
            raise FileNotFoundError(f"Action '{slug}' not found")

        manifest = dest / "action.yaml"
        if not manifest.is_file():
            manifest = dest / "action.yml"
        if manifest.is_file():
            data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
            if data.get("source") == "builtin":
                raise ValueError("Cannot delete a built-in action")

        import shutil
        shutil.rmtree(dest)
        self._commit_removal(session, repo_path, dest, slug)

    def _commit_removal(
        self, session, repo_path: Path, action_dir: Path, slug: str
    ) -> None:
        binding = repos_manager.current_repo(session)
        if not binding:
            return
        rel = action_dir.relative_to(repo_path)
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["rm", "-r", "--cached", "--ignore-unmatch", str(rel)])
        result = run_git(
            repo_path,
            [
                "-c",
                f"user.name={settings.GIT_COMMIT_USER_NAME}",
                "-c",
                f"user.email={settings.GIT_COMMIT_USER_EMAIL}",
                "commit",
                "-m",
                f"Remove action: {slug}",
            ],
            check=False,
        )
        if result.returncode == 0:
            run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH], check=False)

    # ── Runs ──────────────────────────────────────────────────────────

    async def create_run(self, session, slug: str, body: ActionRunRequest) -> ActionRun:
        repo_path = repos_manager.active_repo_path(session)
        action = self.get_action(session, slug)
        hosts = stack_manager.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        user_id = user_storage_id(session.user)
        commit_sha = get_head_sha(repo_path)
        run = ActionRun(
            id=_new_id(),
            action_slug=action.slug,
            action_name=action.name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
            vars=body.vars,
            become=body.become,
            commit_sha=commit_sha,
        )
        db = _get_db()
        await db.execute(
            """INSERT INTO action_runs
               (id, user_id, action_slug, action_name, status, created_at, hosts, output, vars, become, commit_sha)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run.id, user_id, run.action_slug, run.action_name,
                run.status, run.created_at, json.dumps(run.hosts), run.output,
                json.dumps(run.vars), int(run.become), run.commit_sha,
            ),
        )
        await db.commit()

        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        await self._arq_pool.enqueue_job(
            "execute_action_run",
            run_id=run.id,
            repo_path=str(repo_path),
            action_slug=slug,
            hosts=hosts,
            action_vars=body.vars,
            become=body.become,
            runtime_vars=body.runtime_vars or {},
            become_password=body.become_password,
        )
        return run

    async def list_runs(self, session, action_slug: str | None = None) -> list[ActionRun]:
        user_id = user_storage_id(session.user)
        db = _get_db()
        if action_slug:
            cursor = await db.execute(
                "SELECT * FROM action_runs WHERE user_id = ? AND action_slug = ? ORDER BY created_at DESC",
                (user_id, action_slug),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM action_runs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
        rows = await cursor.fetchall()
        return [row_to_action_run(row) for row in rows]

    async def get_run(self, session, run_id: str) -> ActionRun:
        user_id = user_storage_id(session.user)
        db = _get_db()
        cursor = await db.execute(
            "SELECT * FROM action_runs WHERE id = ? AND user_id = ?",
            (run_id, user_id),
        )
        row = await cursor.fetchone()
        if row is None:
            raise KeyError("Run not found")
        return row_to_action_run(row)

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


action_manager = ActionManager()
