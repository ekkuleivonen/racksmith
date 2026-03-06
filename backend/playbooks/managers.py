"""Playbook management, generation, and execution."""

from __future__ import annotations

import asyncio
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
import settings
from github.misc import user_storage_id
from playbooks.role_templates import BUILTIN_ROLE_PREFIX, ROLE_TEMPLATE_SPECS
from racks.managers import rack_manager
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

PLAYBOOKS_DIR = Path("ansible_scripts/playbooks")
ROLES_DIR = PLAYBOOKS_DIR / "roles"
LEGACY_ROLES_DIR = Path("ansible_scripts/roles")
INVENTORY_DIR = Path("ansible_scripts/inventory")
RESERVED_DESCRIPTION_KEY = "racksmith_description"
PLAYBOOK_ID_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


@dataclass(slots=True)
class _InventoryEntry:
    host_key: str
    rack_id: str
    rack_name: str
    item_id: str
    item_name: str
    labels: list[str]


@dataclass(slots=True)
class _RunRecord:
    user_id: str
    run: PlaybookRun
    subscribers: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)


class PlaybookManager:
    def __init__(self) -> None:
        self._runs: dict[str, _RunRecord] = {}

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

    def _inventory_entries(self, session) -> list[_InventoryEntry]:
        entries: list[_InventoryEntry] = []
        try:
            rack_summaries = rack_manager.list_racks(session)
        except FileNotFoundError:
            return []

        for summary in rack_summaries:
            rack = rack_manager.get_rack(session, summary.id)
            hosts: dict[str, dict[str, Any]] = {}
            for item in rack.items:
                if not item.managed or not item.host or not item.ssh_user:
                    continue
                host_key = rack_manager._inventory_unique_host_key(item, hosts)
                hosts[host_key] = {}
                entries.append(
                    _InventoryEntry(
                        host_key=host_key,
                        rack_id=rack.id,
                        rack_name=rack.name,
                        item_id=item.id,
                        item_name=item.name,
                        labels=item.tags,
                    )
                )
        return entries

    def resolve_targets(
        self, session, targets: PlaybookTargetSelection
    ) -> PlaybookResolveTargetsResponse:
        entries = self._inventory_entries(session)
        filtered_entries = entries

        wanted_racks = {rack_id.strip() for rack_id in targets.rack_ids if rack_id.strip()}
        if wanted_racks:
            filtered_entries = [
                entry for entry in filtered_entries if entry.rack_id in wanted_racks
            ]

        wanted_labels = {label.strip() for label in targets.labels if label.strip()}
        if wanted_labels:
            filtered_entries = [
                entry
                for entry in filtered_entries
                if wanted_labels.issubset(set(entry.labels))
            ]

        wanted_items = {
            (item.rack_id.strip(), item.item_id.strip())
            for item in targets.items
            if item.rack_id.strip() and item.item_id.strip()
        }
        if wanted_items:
            filtered_entries = [
                entry
                for entry in filtered_entries
                if (entry.rack_id, entry.item_id) in wanted_items
            ]

        hosts = sorted({entry.host_key for entry in filtered_entries})
        return PlaybookResolveTargetsResponse(hosts=hosts)

    def _run_record_for_user(self, user_id: str, run_id: str) -> _RunRecord:
        record = self._runs.get(run_id)
        if record is None or record.user_id != user_id:
            raise KeyError("Run not found")
        return record

    def list_runs(self, session, playbook_id: str | None = None) -> list[PlaybookRun]:
        user_id = user_storage_id(session.user)
        runs = [
            record.run
            for record in self._runs.values()
            if record.user_id == user_id and (playbook_id is None or record.run.playbook_id == playbook_id)
        ]
        return sorted(runs, key=lambda run: run.created_at, reverse=True)

    def get_run(self, session, run_id: str) -> PlaybookRun:
        user_id = user_storage_id(session.user)
        return self._run_record_for_user(user_id, run_id).run

    async def create_run(self, session, playbook_id: str, body: PlaybookRunRequest) -> PlaybookRun:
        repo_path = setup_manager.active_repo_path(session)
        playbook = self.get_playbook(session, playbook_id)
        hosts = self.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        run = PlaybookRun(
            id=_new_id(),
            playbook_id=playbook.id,
            playbook_name=playbook.play_name,
            status="queued",
            created_at=_now_iso(),
            hosts=hosts,
        )
        record = _RunRecord(user_id=user_storage_id(session.user), run=run)
        self._runs[run.id] = record
        asyncio.create_task(self._execute_run(record, repo_path, playbook.id, hosts))
        return run

    async def _notify(self, record: _RunRecord, payload: dict[str, Any]) -> None:
        for queue in list(record.subscribers):
            await queue.put(payload)

    async def _append_output(self, record: _RunRecord, text: str) -> None:
        record.run.output += text
        await self._notify(record, {"type": "output", "data": text})

    async def _set_run_status(
        self,
        record: _RunRecord,
        *,
        status: str,
        started_at: str | None = None,
        finished_at: str | None = None,
        exit_code: int | None = None,
    ) -> None:
        record.run.status = status
        if started_at is not None:
            record.run.started_at = started_at
        if finished_at is not None:
            record.run.finished_at = finished_at
        if exit_code is not None:
            record.run.exit_code = exit_code
        await self._notify(record, {"type": "status", "run": record.run.model_dump()})

    async def _execute_run(
        self,
        record: _RunRecord,
        repo_path: Path,
        playbook_id: str,
        hosts: list[str],
    ) -> None:
        playbook_path = self._playbook_path(repo_path, playbook_id)
        inventory_dir = self._inventory_dir(repo_path)
        await self._set_run_status(record, status="running", started_at=_now_iso())
        command = [
            "ansible-playbook",
            str(playbook_path),
            "-i",
            str(inventory_dir),
            "--limit",
            ",".join(hosts),
        ]
        await self._append_output(record, f"$ {' '.join(command)}\n")

        try:
            env = os.environ.copy()
            env["ANSIBLE_ROLES_PATH"] = os.pathsep.join(
                [
                    str(self._roles_dir(repo_path)),
                    env.get("ANSIBLE_ROLES_PATH", ""),
                ]
            ).strip(os.pathsep)
            if settings.SSH_DISABLE_HOST_KEY_CHECK:
                env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
            env["ANSIBLE_FORCE_COLOR"] = "True"
            env["PY_COLORS"] = "1"
            env["TERM"] = env.get("TERM") or "xterm-256color"
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(repo_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
        except FileNotFoundError:
            await self._append_output(record, "ansible-playbook was not found on PATH.\n")
            await self._set_run_status(
                record,
                status="failed",
                finished_at=_now_iso(),
                exit_code=127,
            )
            return

        assert process.stdout is not None
        while True:
            chunk = await process.stdout.read(4096)
            if not chunk:
                break
            await self._append_output(record, chunk.decode("utf-8", errors="replace"))

        exit_code = await process.wait()
        await self._set_run_status(
            record,
            status="completed" if exit_code == 0 else "failed",
            finished_at=_now_iso(),
            exit_code=exit_code,
        )

    async def stream_run(self, session, run_id: str, websocket) -> None:
        user_id = user_storage_id(session.user)
        record = self._run_record_for_user(user_id, run_id)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        record.subscribers.append(queue)
        try:
            await websocket.send_json({"type": "snapshot", "run": record.run.model_dump()})
            while True:
                payload = await queue.get()
                await websocket.send_json(payload)
        finally:
            if queue in record.subscribers:
                record.subscribers.remove(queue)


playbook_manager = PlaybookManager()
