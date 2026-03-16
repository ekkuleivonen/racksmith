"""Playbook management, generation, and execution."""

from __future__ import annotations

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
        d["label"] = inp.racksmith_label or humanize_key(inp.key)
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
    ) -> AsyncGenerator[str]:
        """Plan a playbook via LLM, create missing roles sequentially, assemble and save."""
        from _utils.ai import get_model, planner_agent, role_agent, stream_thinking
        from playbooks.prompts import (
            PLANNER_THINKING_INSTRUCTIONS,
            ROLE_THINKING_INSTRUCTIONS,
            build_planner_system_prompt,
        )
        from roles.managers import role_manager
        from roles.prompts import ROLE_SYSTEM_PROMPT

        def _sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        generation_id = uuid.uuid4().hex

        catalog = self.roles_catalog(session)
        catalog_by_id = {r.id: r for r in catalog}
        system_prompt = build_planner_system_prompt(catalog)

        yield _sse({"step": "planning", "session_id": generation_id})

        # Stream planner thinking
        thinking_prompt = (
            f"The user wants a playbook for:\n{prompt}\n\n"
            f"There are {len(catalog)} existing roles in the catalog."
        )
        async for delta in stream_thinking(thinking_prompt, PLANNER_THINKING_INSTRUCTIONS):
            yield _sse({"step": "thinking", "text": delta})

        model = get_model()
        result = await planner_agent.run(prompt, model=model, instructions=system_prompt)
        plan: PlaybookPlan = result.output

        roles_to_create = [
            (i, r) for i, r in enumerate(plan.roles) if isinstance(r, PlaybookPlanRoleCreate)
        ]
        reuse_count = sum(1 for r in plan.roles if isinstance(r, PlaybookPlanRoleReuse))

        yield _sse({
            "step": "planned",
            "session_id": generation_id,
            "plan_name": plan.name,
            "plan_description": plan.description,
            "total_new": len(roles_to_create),
            "total_reuse": reuse_count,
        })

        # -- Create new roles sequentially (so each gets its own thinking stream) --
        created_roles: dict[str, str] = {}

        for plan_idx, entry in roles_to_create:
            try:
                # Stream role thinking
                role_thinking_prompt = (
                    f"Creating role \"{entry.name}\": {entry.description}\n\n"
                    f"Generation instructions: {entry.generation_prompt}"
                )
                async for delta in stream_thinking(role_thinking_prompt, ROLE_THINKING_INSTRUCTIONS):
                    yield _sse({
                        "step": "thinking_role",
                        "index": plan_idx + 1,
                        "total": len(plan.roles),
                        "name": entry.name,
                        "text": delta,
                    })

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

                sub_result = await role_agent.run(sub_prompt, model=get_model(), instructions=ROLE_SYSTEM_PROMPT)
                role_data = sub_result.output
                summary = role_manager.create_role(session, role_data)
                created_roles[entry.name] = summary.id
                yield _sse({
                    "step": "role_created",
                    "index": plan_idx + 1,
                    "total": len(plan.roles),
                    "name": entry.name,
                    "role_id": summary.id,
                })
            except Exception as exc:
                logger.error("role_subagent_failed", role_name=entry.name, error=str(exc))
                yield _sse({
                    "step": "role_failed",
                    "index": plan_idx + 1,
                    "total": len(plan.roles),
                    "name": entry.name,
                    "error": str(exc),
                })

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

        detail = self.create_playbook(session, upsert)
        yield _sse({"step": "done", "playbook_id": detail.id})
        yield "data: [DONE]\n\n"

    def delete_playbook(
        self, session: SessionData, playbook_id: str, *, cascade_roles: bool = False
    ) -> None:
        layout = get_layout(session)

        orphan_role_ids: list[str] = []
        if cascade_roles:
            pb = read_playbook_with_meta(
                layout.playbooks_path / f"{playbook_id}.yml", layout
            )
            pb_role_ids = {re.role for re in pb.roles}

            other_playbooks = [
                p for p in list_playbooks(layout) if p.id != playbook_id
            ]
            used_elsewhere = {
                re.role for p in other_playbooks for re in p.roles
            }
            orphan_role_ids = [
                rid for rid in pb_role_ids if rid not in used_elsewhere
            ]

        remove_playbook(layout, playbook_id)
        logger.info("playbook_removed", playbook_id=playbook_id)

        if orphan_role_ids:
            from core.roles import remove_role

            for rid in orphan_role_ids:
                try:
                    remove_role(layout, rid)
                    logger.info("cascade_role_removed", role_id=rid)
                except Exception:
                    logger.warning("cascade_role_remove_failed", role_id=rid, exc_info=True)

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
