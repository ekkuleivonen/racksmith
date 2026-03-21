"""Playbook management, generation, and execution."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any, cast

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
from core.racksmith_meta import (
    get_playbook_meta,
    read_meta,
    set_playbook_meta,
    write_meta,
)
from core.roles import RoleData, list_roles
from core.serialize import serialize_group_vars, serialize_host_vars, serialize_inventory, serialize_run_payload
from daemon.client import daemon_post
from groups.managers import group_manager
from hosts.managers import host_manager
from playbooks.schemas import (
    AvailableVarEntry,
    AvailableVarsResponse,
    PlaybookCreate,
    PlaybookDetail,
    PlaybookRoleEntry,
    PlaybookRun,
    PlaybookRunRequest,
    PlaybookSummary,
    PlaybookUpdate,
    RequiredRuntimeVarEntry,
    RequiredRuntimeVarsResponse,
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


def _entry_var_supplies_input(entry_vars: dict[str, Any], key: str) -> bool:
    """True when the playbook binds this role input (literal, default merge, or Jinja ref)."""
    if key not in entry_vars:
        return False
    v = entry_vars[key]
    if v is None:
        return False
    if isinstance(v, str) and not v.strip():
        return False
    return True


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
                    folder=p.folder,
                )
            )
        return sorted(results, key=lambda s: (s.name.lower(), s.id))

    def list_playbooks_filtered(
        self,
        session: SessionData,
        *,
        q: str | None,
        label: str | None,
        sort: str,
        order: str,
    ) -> list[PlaybookSummary]:
        rows = self.list_playbooks(session)
        qn = (q or "").strip().lower()
        ln = (label or "").strip().lower()

        def ok(p: PlaybookSummary) -> bool:
            if qn and qn not in p.name.lower() and qn not in (p.description or "").lower():
                return False
            if ln and ln not in p.name.lower() and ln not in (p.description or "").lower():
                return False
            return True

        filtered = [p for p in rows if ok(p)]
        rev = sort_order_reverse(order)
        sk = (sort or "name").lower()

        def sort_key(p: PlaybookSummary) -> tuple[int, str, str]:
            if sk == "updated_at":
                return (0, p.updated_at, p.id)
            if sk == "id":
                return (0, p.id.lower(), p.id)
            return (0, p.name.lower(), p.id)

        filtered.sort(key=sort_key, reverse=rev)
        return filtered

    def get_available_vars(self, session: SessionData, playbook_id: str) -> AvailableVarsResponse:
        detail = self.get_playbook(session, playbook_id)
        catalog = {r.id: r for r in detail.roles_catalog}
        entries: list[AvailableVarEntry] = []

        host_keys: set[str] = set()
        for h in host_manager.list_hosts(session):
            if h.managed and h.vars:
                host_keys.update(h.vars.keys())
        for k in sorted(host_keys):
            entries.append(
                AvailableVarEntry(
                    source="host_var",
                    key=k,
                    var_from="host",
                    role_order=None,
                )
            )

        for g in group_manager.list_groups(session):
            gvars = g.vars or {}
            if not gvars:
                continue
            label = f"Group: {g.name or g.id}"
            for k in sorted(gvars.keys()):
                entries.append(
                    AvailableVarEntry(
                        source="group_var",
                        key=k,
                        var_from=label,
                        role_order=None,
                    )
                )

        for order, re in enumerate(detail.role_entries):
            role = catalog.get(re.role_id)
            if not role:
                continue
            for out in role.outputs or []:
                entries.append(
                    AvailableVarEntry(
                        source="role_output",
                        key=out.key,
                        var_from=role.name,
                        role_order=order,
                        description=out.description,
                        output_type=out.type or "string",
                    )
                )
            for inp in role.inputs or []:
                if inp.default is not None:
                    entries.append(
                        AvailableVarEntry(
                            source="role_default",
                            key=inp.key,
                            var_from=role.name,
                            role_order=order,
                        )
                    )
        return AvailableVarsResponse(vars=entries)

    def get_required_runtime_vars(
        self, session: SessionData, playbook_id: str
    ) -> RequiredRuntimeVarsResponse:
        detail = self.get_playbook(session, playbook_id)
        catalog = {r.id: r for r in detail.roles_catalog}
        inputs: list[RequiredRuntimeVarEntry] = []
        seen_keys: set[str] = set()
        for re in detail.role_entries:
            role = catalog.get(re.role_id)
            if not role:
                continue
            entry_vars = re.vars or {}
            for inp in role.inputs:
                t = (inp.type or "string").lower()
                is_secret = bool(inp.secret) or t == "secret"
                no_default = inp.default is None
                if not is_secret and not (inp.required and no_default):
                    continue
                if _entry_var_supplies_input(entry_vars, inp.key):
                    continue
                if inp.key in seen_keys:
                    continue
                seen_keys.add(inp.key)
                opts = list(inp.options or inp.choices or [])
                inputs.append(
                    RequiredRuntimeVarEntry(
                        key=inp.key,
                        label=inp.label or inp.key,
                        type="string" if is_secret else t,
                        required=inp.required,
                        options=opts,
                        role_id=role.id,
                        role_name=role.name,
                        secret=is_secret,
                    )
                )
        return RequiredRuntimeVarsResponse(
            inputs=inputs,
            needs_become_password=detail.become,
        )

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

    def create_playbook(self, session: SessionData, body: PlaybookCreate) -> PlaybookDetail:
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
        self, session: SessionData, playbook_id: str, body: PlaybookUpdate
    ) -> PlaybookDetail:
        layout = get_layout(session)
        roles_catalog = {r.id: r for r in list_roles(layout)}
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        current = read_playbook_with_meta(playbook_path, layout)
        name = current.name
        if body.name is not None:
            name = body.name.strip()
        description = current.description
        if body.description is not None:
            description = body.description.strip()
        become = current.become
        if body.become is not None:
            become = body.become

        if body.roles is not None:
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
        else:
            ansible_roles = list(current.roles)

        playbook_data = PlaybookData(
            id=playbook_id,
            path=playbook_path,
            name=name,
            description=description,
            hosts=current.hosts,
            gather_facts=current.gather_facts,
            become=become,
            roles=ansible_roles,
            raw_content=current.raw_content,
            registry_id=current.registry_id,
            registry_version=current.registry_version,
            folder=current.folder,
        )
        write_playbook(layout, playbook_data)
        logger.info("playbook_updated", playbook_id=playbook_id)
        return self.get_playbook(session, playbook_id)

    def move_to_folder(self, session: SessionData, playbook_id: str, folder: str) -> None:
        layout = get_layout(session)
        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError("Playbook not found")
        meta = read_meta(layout)
        pb_meta = get_playbook_meta(meta, playbook_id)
        if folder:
            pb_meta["folder"] = folder
        else:
            pb_meta.pop("folder", None)
        set_playbook_meta(meta, playbook_id, pb_meta)
        write_meta(layout, meta)

    async def generate_playbook(
        self,
        session: SessionData,
        prompt: str,
    ) -> AsyncGenerator[str]:
        """Generate a playbook via an LLM agent that creates roles and assembles them."""
        from _utils.agent_stream import AgentDeps, stream_agent
        from _utils.ai import playbook_agent
        from playbooks.prompts import PLAYBOOK_SYSTEM_PROMPT

        deps = AgentDeps(session=session)
        async for event in stream_agent(playbook_agent, prompt, deps, instructions=PLAYBOOK_SYSTEM_PROMPT):
            yield event

    async def edit_generate_playbook(
        self,
        session: SessionData,
        playbook_id: str,
        prompt: str,
    ) -> AsyncGenerator[str]:
        """Edit a playbook via an LLM agent using natural-language instructions."""
        from _utils.agent_stream import AgentDeps, stream_agent
        from _utils.ai import playbook_agent
        from playbooks.prompts import PLAYBOOK_EDIT_SYSTEM_PROMPT

        deps = AgentDeps(session=session)
        detail = self.get_playbook(session, playbook_id)
        catalog_by_id = {r.id: r for r in detail.roles_catalog}

        enriched_roles: list[dict] = []
        for re in detail.role_entries:
            entry: dict = {"role_id": re.role_id, "vars": re.vars}
            cat = catalog_by_id.get(re.role_id)
            if cat:
                entry["role_name"] = cat.name
                entry["role_description"] = cat.description[:200]
                entry["inputs"] = [
                    f"{i.key}({i.type})" for i in cat.inputs
                ]
            enriched_roles.append(entry)

        existing_json = json.dumps(
            {
                "name": detail.name,
                "description": detail.description,
                "become": detail.become,
                "roles": enriched_roles,
            },
            indent=2,
        )
        user_prompt = (
            f"Playbook ID: {playbook_id}\n\n"
            f"Current playbook:\n{existing_json}\n\n"
            f"Requested changes:\n{prompt}"
        )
        async for event in stream_agent(
            playbook_agent, user_prompt, deps,
            instructions=PLAYBOOK_EDIT_SYSTEM_PROMPT,
        ):
            yield event

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
            await daemon_post("/ansible/validate-become", {
                "inventory_yaml": serialize_inventory(layout),
                "host_vars": serialize_host_vars(layout),
                "group_vars": serialize_group_vars(layout),
                "hosts": hosts,
                "become_password": body.become_password,
            }, timeout=30.0)

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

        payload = serialize_run_payload(layout, playbook.id)
        pool = self._ensure_arq_pool()
        await pool.enqueue_job(
            "execute_playbook_run",
            run_id=run.id,
            playbook_yaml=payload["playbook_yaml"],
            inventory_yaml=payload["inventory_yaml"],
            host_vars=payload["host_vars"],
            group_vars=payload["group_vars"],
            role_files=payload["role_files"],
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
