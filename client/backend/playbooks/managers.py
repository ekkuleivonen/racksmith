"""Playbook management, generation, and execution."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import cast

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
from core.playbooks import (
    PlaybookData,
    list_playbooks,
    read_playbook_with_meta,
    remove_playbook,
    write_playbook,
)
from core.playbooks import (
    PlaybookRoleEntry as AnsiblePlaybookRoleEntry,
)
from core.roles import RoleData, list_roles
from core.run import validate_become_password
from hosts.managers import host_manager
from playbooks.schemas import (
    PlaybookDetail,
    PlaybookPlan,
    PlaybookPlanRoleCreate,
    PlaybookPlanRoleReuse,
    PlaybookRoleEntry,
    PlaybookRun,
    PlaybookRunRequest,
    PlaybookSummary,
    PlaybookUpsert,
    ResolveTargetsResponse,
    RoleCatalogEntry,
    TargetSelection,
)

logger = get_logger(__name__)

def _generate_playbook_id(layout: AnsibleLayout) -> str:
    existing = {p.id for p in list_playbooks(layout)}
    return generate_unique_id("playbook", lambda c: c in existing)


def _role_data_to_catalog(r: RoleData) -> RoleCatalogEntry:
    """Convert RoleData to RoleCatalogEntry."""
    inputs_list = []
    for inp in r.inputs:
        d = dict(inp.__dict__)
        d["label"] = inp.description or humanize_key(inp.key)
        inputs_list.append(RoleInputSpec.model_validate(d))
    return RoleCatalogEntry(
        id=r.id,
        name=r.name,
        description=r.description,
        inputs=inputs_list,
        outputs=list(r.outputs),
        labels=r.tags,
    )


def _role_default_vars(role: RoleData) -> dict:
    return {inp.key: inp.default for inp in role.inputs if inp.default is not None}


def _merged_role_vars(role: RoleData, supplied_vars: dict | None) -> dict:
    return {
        **_role_default_vars(role),
        **(supplied_vars or {}),
    }


class PlaybookManager(RunManagerMixin):
    def roles_catalog(self, session: SessionData) -> list[RoleCatalogEntry]:
        """List all roles for catalog display."""
        layout = get_layout_or_none(session)
        if layout is None:
            return []
        return [_role_data_to_catalog(r) for r in list_roles(layout)]

    def list_playbooks(self, session: SessionData) -> list[PlaybookSummary]:
        layout = get_layout_or_none(session)
        if layout is None:
            return []
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
                    else now_iso(),
                    registry_id=p.registry_id,
                    registry_version=p.registry_version,
                )
            )
        return sorted(results, key=lambda s: (s.name.lower(), s.id))

    def get_playbook(self, session: SessionData, playbook_id: str) -> PlaybookDetail:
        layout = get_layout(session)
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        p = read_playbook_with_meta(playbook_path, layout)
        roles_data = list_roles(layout)
        role_entries = [
            PlaybookRoleEntry(role_id=re.role, vars=re.vars or {}) for re in p.roles
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
            roles_catalog=[_role_data_to_catalog(r) for r in roles_data],
            role_entries=role_entries,
            raw_content=p.raw_content,
            become=p.become,
        )

    def create_playbook(self, session: SessionData, body: PlaybookUpsert) -> PlaybookDetail:
        layout = get_layout(session)
        roles_catalog = {r.id: r for r in list_roles(layout)}
        playbook_id = _generate_playbook_id(layout)
        ansible_roles: list[AnsiblePlaybookRoleEntry] = []
        for re in body.roles:
            if re.role_id not in roles_catalog:
                raise ValueError(f"Unknown role: {re.role_id}")
            role_data = roles_catalog[re.role_id]
            ansible_roles.append(
                AnsiblePlaybookRoleEntry(
                    role=role_data.id,
                    vars=_merged_role_vars(role_data, re.vars),
                )
            )
        playbook_data = PlaybookData(
            id=playbook_id,
            path=layout.playbooks_path / f"{playbook_id}.yml",
            name=body.name.strip(),
            description=body.description.strip(),
            hosts="all",
            gather_facts=True,
            become=body.become,
            roles=ansible_roles,
            raw_content="",
        )
        write_playbook(layout, playbook_data)
        logger.info("playbook_created", playbook_id=playbook_id)
        return self.get_playbook(session, playbook_id)

    def update_playbook(
        self, session: SessionData, playbook_id: str, body: PlaybookUpsert
    ) -> PlaybookDetail:
        layout = get_layout(session)
        roles_catalog = {r.id: r for r in list_roles(layout)}
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        ansible_roles: list[AnsiblePlaybookRoleEntry] = []
        for re in body.roles:
            if re.role_id not in roles_catalog:
                raise ValueError(f"Unknown role: {re.role_id}")
            role_data = roles_catalog[re.role_id]
            ansible_roles.append(
                AnsiblePlaybookRoleEntry(
                    role=role_data.id,
                    vars=_merged_role_vars(role_data, re.vars),
                )
            )
        playbook_data = PlaybookData(
            id=playbook_id,
            path=playbook_path,
            name=body.name.strip(),
            description=body.description.strip(),
            hosts="all",
            gather_facts=True,
            become=body.become,
            roles=ansible_roles,
            raw_content="",
        )
        write_playbook(layout, playbook_data)
        logger.info("playbook_updated", playbook_id=playbook_id)
        return self.get_playbook(session, playbook_id)

    async def generate_playbook(
        self,
        session: SessionData,
        prompt: str,
        generation_session_id: str | None = None,
    ) -> AsyncGenerator[str]:
        """Plan a playbook via LLM, create missing roles in parallel, assemble and save."""
        from _utils.ai import planner_agent, role_agent
        from _utils.generation_session import (
            load_generation_session,
            save_generation_session,
        )
        from playbooks.prompts import build_planner_system_prompt
        from roles.managers import role_manager
        from roles.prompts import ROLE_SYSTEM_PROMPT

        def _sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        catalog = self.roles_catalog(session)
        catalog_by_id = {r.id: r for r in catalog}
        system_prompt = build_planner_system_prompt(catalog)

        # -- Load or create generation session --
        prior_messages = None
        created_roles: dict[str, str] = {}
        existing_playbook_id: str | None = None

        if generation_session_id:
            state = await load_generation_session(generation_session_id)
            if state:
                prior_messages = state.get("messages")
                created_roles = state.get("created_roles", {})
                existing_playbook_id = state.get("playbook_id")
        else:
            generation_session_id = uuid.uuid4().hex

        # -- Run planner agent --
        yield _sse({"step": "planning", "session_id": generation_session_id})

        from pydantic import TypeAdapter
        from pydantic_ai.messages import ModelMessage

        _msg_ta = TypeAdapter(list[ModelMessage])

        planner_kwargs: dict = {"instructions": system_prompt}
        if prior_messages:
            planner_kwargs["message_history"] = _msg_ta.validate_python(prior_messages)

        result = await planner_agent.run(prompt, **planner_kwargs)
        plan: PlaybookPlan = result.output

        # Persist planner messages as JSON-serializable dicts
        messages_serialized = _msg_ta.dump_python(
            list(result.all_messages()), mode="json"
        )
        session_state: dict = {
            "messages": messages_serialized,
            "plan": plan.model_dump(),
            "created_roles": created_roles,
            "playbook_id": existing_playbook_id,
        }
        await save_generation_session(generation_session_id, session_state)

        roles_to_create = [
            (i, r) for i, r in enumerate(plan.roles) if isinstance(r, PlaybookPlanRoleCreate)
        ]
        reuse_count = sum(1 for r in plan.roles if isinstance(r, PlaybookPlanRoleReuse))

        yield _sse({
            "step": "planned",
            "session_id": generation_session_id,
            "plan_name": plan.name,
            "plan_description": plan.description,
            "total_new": len(roles_to_create),
            "total_reuse": reuse_count,
        })

        # -- Create new roles in parallel --
        async def _create_role(entry: PlaybookPlanRoleCreate) -> tuple[str, str]:
            """Generate a role via sub-agent and persist it. Returns (entry.name, role_id)."""
            inputs_json = json.dumps(
                [inp.model_dump(exclude_defaults=True) | {"key": inp.key} for inp in entry.expected_inputs]
            ) if entry.expected_inputs else "[]"
            outputs_json = json.dumps(
                [out.model_dump(exclude_defaults=True) | {"key": out.key} for out in entry.expected_outputs]
            ) if entry.expected_outputs else "[]"

            sub_prompt = (
                f"{entry.generation_prompt}\n\n"
                f"The role MUST be named: {entry.name}\n"
                f"Description: {entry.description}\n\n"
                f"The role MUST declare these inputs:\n{inputs_json}\n\n"
                f"The role MUST produce these outputs via set_fact:\n{outputs_json}"
            )

            sub_result = await role_agent.run(sub_prompt, instructions=ROLE_SYSTEM_PROMPT)
            role_data = sub_result.output
            summary = role_manager.create_role(session, role_data)
            return entry.name, summary.id

        # Filter out roles already created in a prior run
        pending = [
            (i, entry)
            for i, entry in roles_to_create
            if entry.name not in created_roles
        ]

        if pending:
            tasks = [_create_role(pe) for _, pe in pending]
            gather_results = await asyncio.gather(*tasks, return_exceptions=True)

            for idx, (plan_idx, pending_entry) in enumerate(pending):
                res = gather_results[idx]
                if isinstance(res, BaseException):
                    logger.error("role_subagent_failed", role_name=pending_entry.name, error=str(res))
                    yield _sse({
                        "step": "role_failed",
                        "index": plan_idx + 1,
                        "total": len(plan.roles),
                        "name": pending_entry.name,
                        "error": str(res),
                    })
                    continue

                role_name, role_id = res
                created_roles[role_name] = role_id
                yield _sse({
                    "step": "role_created",
                    "index": plan_idx + 1,
                    "total": len(plan.roles),
                    "name": role_name,
                    "role_id": role_id,
                })

            session_state["created_roles"] = created_roles
            await save_generation_session(generation_session_id, session_state)

        # -- Assemble PlaybookUpsert --
        playbook_roles: list[PlaybookRoleEntry] = []
        for plan_entry in plan.roles:
            if isinstance(plan_entry, PlaybookPlanRoleReuse):
                if plan_entry.role_id not in catalog_by_id:
                    logger.warning("plan_reuse_unknown_role", role_id=plan_entry.role_id)
                    continue
                playbook_roles.append(PlaybookRoleEntry(role_id=plan_entry.role_id, vars=plan_entry.vars))
            elif isinstance(plan_entry, PlaybookPlanRoleCreate):
                created_id = created_roles.get(plan_entry.name)
                if not created_id:
                    logger.warning("plan_create_missing_role", role_name=plan_entry.name)
                    continue
                playbook_roles.append(PlaybookRoleEntry(role_id=created_id, vars=plan_entry.vars))

        upsert = PlaybookUpsert(
            name=plan.name,
            description=plan.description,
            become=plan.become,
            roles=playbook_roles,
        )

        yield _sse({"step": "assembling"})

        if existing_playbook_id:
            try:
                detail = self.update_playbook(session, existing_playbook_id, upsert)
                playbook_id = existing_playbook_id
            except FileNotFoundError:
                detail = self.create_playbook(session, upsert)
                playbook_id = detail.id
        else:
            detail = self.create_playbook(session, upsert)
            playbook_id = detail.id

        session_state["playbook_id"] = playbook_id
        await save_generation_session(generation_session_id, session_state)

        yield _sse({"step": "done", "playbook_id": playbook_id})
        yield "data: [DONE]\n\n"

    def delete_playbook(self, session: SessionData, playbook_id: str) -> None:
        layout = get_layout(session)
        remove_playbook(layout, playbook_id)
        logger.info("playbook_removed", playbook_id=playbook_id)

    def resolve_targets(
        self, session: SessionData, targets: TargetSelection
    ) -> ResolveTargetsResponse:
        try:
            all_hosts = host_manager.list_hosts(session)
        except FileNotFoundError:
            return ResolveTargetsResponse(hosts=[])

        managed = [h for h in all_hosts if h.managed and h.ip_address and h.ssh_user]
        filtered = managed

        wanted_groups = {g.strip() for g in targets.groups if g.strip()}
        if wanted_groups:
            filtered = [
                h for h in filtered if wanted_groups.intersection(set(h.groups))
            ]

        wanted_labels = {t.strip() for t in targets.labels if t.strip()}
        if wanted_labels:
            filtered = [h for h in filtered if wanted_labels.issubset(set(h.labels))]

        wanted_hosts = {s.strip() for s in targets.hosts if s.strip()}
        if wanted_hosts:
            filtered = [h for h in filtered if h.id in wanted_hosts]

        wanted_racks = {r.strip() for r in targets.racks if r.strip()}
        if wanted_racks:
            filtered = [
                h for h in filtered if h.placement and h.placement.rack in wanted_racks
            ]

        hosts = sorted({h.id for h in filtered})
        return ResolveTargetsResponse(hosts=hosts)

    async def _load_run(self, run_id: str) -> PlaybookRun | None:
        """Load a PlaybookRun from Redis, or None if expired/missing."""
        data = await load_run(run_id)
        if data is None:
            return None
        return PlaybookRun(
            id=data.get("id", run_id),
            playbook_id=data.get("playbook_id", ""),
            playbook_name=data.get("playbook_name", ""),
            status=cast("RunStatus", data.get("status", "queued")),
            created_at=data.get("created_at", ""),
            started_at=data.get("started_at") or None,
            finished_at=data.get("finished_at") or None,
            exit_code=int(data["exit_code"]) if data.get("exit_code") else None,
            hosts=json.loads(data["hosts"]) if data.get("hosts") else [],
            output=data.get("output", ""),
            commit_sha=data.get("commit_sha") or None,
        )

    async def create_run(
        self, session: SessionData, playbook_id: str, body: PlaybookRunRequest
    ) -> PlaybookRun:
        layout = get_layout(session)
        repo_path = layout.repo_path
        playbook = self.get_playbook(session, playbook_id)
        hosts = self.resolve_targets(session, body.targets).hosts
        if not hosts:
            raise ValueError("No hosts matched the selected targets")

        if playbook.become and body.become_password:
            await validate_become_password(
                repo_path, hosts, body.become_password
            )

        commit_sha = await aget_head_sha(repo_path)
        run = PlaybookRun(
            id=new_id(),
            playbook_id=playbook.id,
            playbook_name=playbook.name,
            status="queued",
            created_at=now_iso(),
            hosts=hosts,
            commit_sha=commit_sha,
        )
        await save_run(run.id, {
            "id": run.id,
            "playbook_id": run.playbook_id,
            "playbook_name": run.playbook_name,
            "status": run.status,
            "created_at": run.created_at,
            "hosts": json.dumps(run.hosts),
            "output": "",
            "commit_sha": run.commit_sha or "",
        })

        pool = self._ensure_arq_pool()
        await pool.enqueue_job(
            "execute_playbook_run",
            run_id=run.id,
            repo_path=str(repo_path),
            playbook_id=playbook.id,
            hosts=hosts,
            runtime_vars=body.runtime_vars or {},
            become=playbook.become,
            become_password=body.become_password,
        )
        logger.info(
            "playbook_run_submitted",
            run_id=run.id,
            playbook_id=playbook.id,
            host_count=len(hosts),
        )
        return run

playbook_manager = PlaybookManager()
