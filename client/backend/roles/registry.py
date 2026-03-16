"""Registry proxy: forward requests with GitHub token, push/import logic."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx

import settings
from _utils.helpers import generate_unique_id
from _utils.logging import get_logger
from _utils.redis import AsyncRedis
from _utils.schemas import PlatformSpec, RoleInputSpec
from auth.git import arun_git
from auth.session import SessionData, update_session_tokens
from core import resolve_layout
from core.config import AnsibleLayout
from core.playbooks import (
    PlaybookData,
    read_playbook_with_meta,
    write_playbook,
)
from core.playbooks import (
    PlaybookRoleEntry as AnsiblePlaybookRoleEntry,
)
from core.playbooks import (
    list_playbooks as list_local_playbooks,
)
from core.racksmith_meta import (
    get_playbook_meta,
    get_role_meta,
    read_meta,
    set_playbook_meta,
    set_role_meta,
    write_meta,
)
from core.roles import (
    RoleData,
    RoleInput,
    read_role,
    read_role_tasks,
    write_role,
)
from core.roles import (
    list_roles as list_local_roles,
)
from repo.managers import repos_manager
from roles.registry_schemas import (
    PlaybookCreate as RegistryPlaybookCreate,
)
from roles.registry_schemas import (
    PlaybookFacets,
    PlaybookImportResponse,
    PlaybookRoleRef,
    RegistryFacets,
    RegistryPlaybook,
    RegistryPlaybookList,
    RegistryPlaybookVersion,
    RegistryRole,
    RegistryRoleList,
    RegistryVersion,
    RoleCreate,
    RoleImportResponse,
)

logger = get_logger(__name__)


def _cache_key(namespace: str, params: dict[str, str | int]) -> str:
    """Deterministic cache key from namespace + sorted params."""
    raw = json.dumps(params, sort_keys=True)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"{settings.REDIS_REGISTRY_CACHE_PREFIX}{namespace}:{digest}"


async def _cache_get(key: str) -> str | None:
    try:
        return await AsyncRedis.get(key)
    except Exception:
        return None


async def _cache_set(key: str, value: str) -> None:
    try:
        await AsyncRedis.setex(key, settings.REGISTRY_CACHE_TTL, value)
    except Exception:
        pass


async def _cache_invalidate() -> None:
    """Invalidate all registry cache keys."""
    try:
        client = AsyncRedis._get_client()
        pattern = f"{settings.REDIS_REGISTRY_CACHE_PREFIX}*"
        cursor: int = 0
        while True:
            cursor, keys = await client.scan(cursor, match=pattern, count=100)
            if keys:
                await client.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        pass


class RegistryManager:
    def _headers(self, session: SessionData) -> dict[str, str]:
        return {"Authorization": f"Bearer {session.access_token}"}

    async def _refresh_session(self, session: SessionData) -> bool:
        """Refresh the GitHub token via registry and update the Redis session."""
        if not session.refresh_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.REGISTRY_URL}/auth/refresh",
                    json={"refresh_token": session.refresh_token},
                    timeout=10,
                )
            if resp.status_code != 200:
                logger.warning("registry_token_refresh_failed", status_code=resp.status_code)
                return False
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("registry_token_refresh_error", error=str(exc), exc_info=True)
            return False

        new_token = data.get("github_access_token")
        new_refresh = data.get("refresh_token", "")
        if not new_token:
            return False

        session.access_token = new_token
        session.refresh_token = new_refresh
        if session.session_id:
            await update_session_tokens(session.session_id, new_token, new_refresh)

        logger.info("registry_token_refreshed")
        return True

    async def _request(
        self,
        session: SessionData,
        method: str,
        path: str,
        *,
        params: dict[str, str | int] | None = None,
        json_body: dict | list | None = None,
        timeout: float = 30.0,
    ) -> httpx.Response:
        """Authenticated registry request with automatic token refresh on 401."""
        url = f"{settings.REGISTRY_URL}{path}"

        async with httpx.AsyncClient() as client:
            resp = await client.request(
                method, url,
                params=params,
                json=json_body,
                headers=self._headers(session),
                timeout=timeout,
            )

        if resp.status_code == 401 and await self._refresh_session(session):
            async with httpx.AsyncClient() as client:
                resp = await client.request(
                    method, url,
                    params=params,
                    json=json_body,
                    headers=self._headers(session),
                    timeout=timeout,
                )

        return resp

    async def list_roles(
        self,
        session: SessionData,
        *,
        q: str | None = None,
        tags: str | None = None,
        platforms: str | None = None,
        owner: str | None = None,
        sort: str = "recent",
        page: int = 1,
        per_page: int = 20,
    ) -> RegistryRoleList:
        params: dict[str, str | int] = {
            "sort": sort,
            "page": page,
            "per_page": per_page,
        }
        if q:
            params["q"] = q
        if tags:
            params["tags"] = tags
        if platforms:
            params["platforms"] = platforms
        if owner:
            params["owner"] = owner

        cache_k = _cache_key("roles", params)
        cached = await _cache_get(cache_k)
        if cached:
            return RegistryRoleList.model_validate_json(cached)

        resp = await self._request(session, "GET", "/roles", params=params)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryRoleList.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    async def get_facets(
        self,
        session: SessionData,
    ) -> RegistryFacets:
        params: dict[str, str | int] = {}
        cache_k = _cache_key("facets", params)
        cached = await _cache_get(cache_k)
        if cached:
            return RegistryFacets.model_validate_json(cached)

        resp = await self._request(session, "GET", "/roles/facets", params=params)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryFacets.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    async def get_role(
        self,
        session: SessionData,
        slug: str,
    ) -> RegistryRole:
        cache_k = _cache_key("role", {"slug": slug})
        cached = await _cache_get(cache_k)
        if cached:
            return RegistryRole.model_validate_json(cached)

        resp = await self._request(session, "GET", f"/roles/{slug}")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryRole.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    def _resolve_role_by_id(self, layout: AnsibleLayout, role_id: str) -> tuple[RoleData, Path]:
        """Find local role by directory name (role_id)."""
        role_dir = layout.roles_path / role_id
        role = read_role(role_dir)
        if role is None:
            raise FileNotFoundError(f"Local role '{role_id}' not found")
        role.id = role_id
        return role, role_dir

    async def push_role(self, session: SessionData, role_id: str) -> RegistryRole:
        """Read local role via ansible module, serialize, POST or PUT to registry."""
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        role, role_dir = self._resolve_role_by_id(layout, role_id)

        tasks_yaml = read_role_tasks(role_dir)
        defaults_yaml = ""
        for name in ("main.yml", "main.yaml"):
            p = role_dir / "defaults" / name
            if p.is_file():
                defaults_yaml = p.read_text(encoding="utf-8")
                break

        meta_yaml = ""
        meta_path = role_dir / "meta" / "main.yml"
        if meta_path.is_file():
            meta_yaml = meta_path.read_text(encoding="utf-8")

        platforms = [
            PlatformSpec(name=p.get("name", str(p)), versions=p.get("versions", []))
            if isinstance(p, dict)
            else PlatformSpec(name=str(p))
            for p in role.platforms
        ]
        inputs_list = [
            RoleInputSpec.model_validate({
                "key": inp.key,
                "description": inp.description,
                "type": inp.type,
                "default": inp.default,
                "required": inp.required,
                "choices": inp.choices,
                "no_log": inp.no_log,
                "racksmith_placeholder": inp.racksmith_placeholder,
                "racksmith_secret": inp.racksmith_secret,
            })
            for inp in role.inputs
        ]

        payload = RoleCreate(
            name=role.name,
            description=role.description,
            platforms=platforms,
            tags=role.tags,
            inputs=inputs_list,
            tasks_yaml=tasks_yaml,
            defaults_yaml=defaults_yaml,
            meta_yaml=meta_yaml,
        )

        resp = await self._request(session, "PUT", "/roles", json_body=payload.model_dump())
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", role_id=role_id, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryRole.model_validate(resp.json())

        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)

        role_meta["registry_id"] = result.slug
        role_meta["registry_uuid"] = result.id
        set_role_meta(meta, role_id, role_meta)
        write_meta(layout, meta)

        logger.info("registry_role_pushed", role_id=role_id, registry_slug=result.slug)
        await _cache_invalidate()
        return result

    async def import_role(self, session: SessionData, slug: str) -> RoleImportResponse:
        """Download from registry, write to local repo using ansible/roles module."""
        resp = await self._request(session, "POST", f"/roles/{slug}/download")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        version = RegistryVersion.model_validate(resp.json())
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)

        meta = read_meta(layout)
        for r in list_local_roles(layout):
            rmeta = get_role_meta(meta, r.id)
            existing_uuid = str(rmeta.get("registry_uuid", rmeta.get("registry_id", "")))
            if existing_uuid == str(version.role_id):
                return RoleImportResponse(
                    slug=slug, name=version.name,
                    message="Role already exists locally",
                )

        platforms = [
            p.model_dump() if isinstance(p, PlatformSpec) else {"name": str(p)}
            for p in (version.platforms or [])
        ]
        inputs = []
        for inp in version.inputs or []:
            raw = inp.model_dump() if hasattr(inp, "model_dump") else inp
            if isinstance(raw, dict):
                inputs.append(
                    RoleInput(
                        key=raw.get("key", ""),
                        description=raw.get("description", ""),
                        type=raw.get("type", "str"),
                        default=raw.get("default"),
                        required=raw.get("required", False),
                        choices=raw.get("choices", raw.get("options", [])) or [],
                        no_log=raw.get("no_log", False),
                        racksmith_placeholder=raw.get("placeholder", ""),
                        racksmith_secret=bool(raw.get("secret", raw.get("interactive", False))),
                    )
                )

        existing_ids = {sub.name for sub in layout.roles_path.iterdir()} if layout.roles_path.is_dir() else set()
        role_id = generate_unique_id("role", lambda c: c in existing_ids)

        role_data = RoleData(
            name=version.name,
            description=version.description,
            platforms=platforms,
            tags=version.tags or [],
            inputs=inputs,
            has_tasks=bool(version.tasks_yaml and version.tasks_yaml.strip()),
            id=role_id,
        )

        write_role(layout, role_data, tasks_yaml=version.tasks_yaml or None)

        meta = read_meta(layout)
        role_meta = get_role_meta(meta, role_id)
        role_meta["registry_id"] = slug
        role_meta["registry_uuid"] = version.role_id
        role_meta["registry_version"] = version.version_number
        set_role_meta(meta, role_id, role_meta)
        write_meta(layout, meta)

        if version.defaults_yaml and version.defaults_yaml.strip():
            defaults_dir = layout.roles_path / role_id / "defaults"
            defaults_dir.mkdir(parents=True, exist_ok=True)
            (defaults_dir / "main.yml").write_text(version.defaults_yaml, encoding="utf-8")

        if version.download_event_id:
            try:
                await self._request(
                    session, "POST", f"/roles/{slug}/confirm-download",
                    json_body={"download_event_id": version.download_event_id},
                )
            except Exception:
                logger.warning("confirm_download_failed", slug=slug, exc_info=True)

        role_dir = layout.roles_path / role_id
        binding = repos_manager.current_repo(session)
        if binding:
            remote_url = (
                f"https://x-access-token:{session.access_token}"
                f"@github.com/{binding.owner}/{binding.repo}.git"
            )
            await arun_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
            racksmith_yml = layout.racksmith_base / ".racksmith.yml"
            await arun_git(repo_path, [
                "add",
                str(role_dir.relative_to(repo_path)),
                str(racksmith_yml.relative_to(repo_path)),
            ])
            await arun_git(
                repo_path,
                [
                    "-c",
                    f"user.name={settings.GIT_COMMIT_USER_NAME}",
                    "-c",
                    f"user.email={settings.GIT_COMMIT_USER_EMAIL}",
                    "commit",
                    "-m",
                    f"Import role from registry: {slug}",
                ],
                check=False,
            )
            await arun_git(repo_path, ["push", "origin", settings.GIT_RACKSMITH_BRANCH], check=False)

        logger.info("role_imported_from_registry", slug=slug, version=version.version_number)
        return RoleImportResponse(
            slug=slug,
            name=version.name,
            message="Imported and pushed to GitHub",
        )

    async def delete_role(self, session: SessionData, slug: str) -> None:
        resp = await self._request(session, "DELETE", f"/roles/{slug}")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise
        logger.info("registry_role_deleted", slug=slug)
        await _cache_invalidate()

    # ── Playbook methods ──────────────────────────────────────────────────

    async def list_playbooks(
        self,
        session: SessionData,
        *,
        q: str | None = None,
        tags: str | None = None,
        owner: str | None = None,
        sort: str = "recent",
        page: int = 1,
        per_page: int = 20,
    ) -> RegistryPlaybookList:
        params: dict[str, str | int] = {
            "sort": sort,
            "page": page,
            "per_page": per_page,
        }
        if q:
            params["q"] = q
        if tags:
            params["tags"] = tags
        if owner:
            params["owner"] = owner

        cache_k = _cache_key("playbooks", params)
        cached = await _cache_get(cache_k)
        if cached:
            return RegistryPlaybookList.model_validate_json(cached)

        resp = await self._request(session, "GET", "/playbooks", params=params)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryPlaybookList.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    async def get_playbook_facets(
        self,
        session: SessionData,
    ) -> PlaybookFacets:
        params: dict[str, str | int] = {}
        cache_k = _cache_key("playbook_facets", params)
        cached = await _cache_get(cache_k)
        if cached:
            return PlaybookFacets.model_validate_json(cached)

        resp = await self._request(session, "GET", "/playbooks/facets", params=params)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = PlaybookFacets.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    async def get_playbook(
        self,
        session: SessionData,
        slug: str,
    ) -> RegistryPlaybook:
        cache_k = _cache_key("playbook", {"slug": slug})
        cached = await _cache_get(cache_k)
        if cached:
            return RegistryPlaybook.model_validate_json(cached)

        resp = await self._request(session, "GET", f"/playbooks/{slug}")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryPlaybook.model_validate(resp.json())
        await _cache_set(cache_k, result.model_dump_json())
        return result

    async def push_playbook(self, session: SessionData, playbook_id: str) -> RegistryPlaybook:
        """Read local playbook, resolve role registry_ids, push to registry."""
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)

        playbook_path = layout.playbooks_path / f"{playbook_id}.yml"
        if not playbook_path.exists():
            playbook_path = layout.playbooks_path / f"{playbook_id}.yaml"
        if not playbook_path.exists():
            raise FileNotFoundError(f"Local playbook '{playbook_id}' not found")

        pb = read_playbook_with_meta(playbook_path, layout)
        meta = read_meta(layout)

        role_refs: list[PlaybookRoleRef] = []
        for re_entry in pb.roles:
            role_meta = get_role_meta(meta, re_entry.role)
            registry_uuid = str(role_meta.get("registry_uuid", role_meta.get("registry_id", "")))
            if not registry_uuid:
                pushed = await self.push_role(session, re_entry.role)
                registry_uuid = pushed.id
                meta = read_meta(layout)
            role_refs.append(PlaybookRoleRef(
                registry_role_id=registry_uuid,
                vars=re_entry.vars,
            ))

        payload = RegistryPlaybookCreate(
            name=pb.name,
            description=pb.description,
            become=pb.become,
            roles=role_refs,
            tags=[],
        )

        resp = await self._request(
            session, "PUT", "/playbooks",
            json_body=payload.model_dump(mode="json"),
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", playbook_id=playbook_id, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        result = RegistryPlaybook.model_validate(resp.json())

        meta = read_meta(layout)
        pb_meta = get_playbook_meta(meta, playbook_id)
        pb_meta["registry_id"] = result.slug
        pb_meta["registry_uuid"] = result.id
        set_playbook_meta(meta, playbook_id, pb_meta)
        write_meta(layout, meta)

        logger.info("registry_playbook_pushed", playbook_id=playbook_id, registry_slug=result.slug)
        await _cache_invalidate()
        return result

    async def import_playbook(self, session: SessionData, slug: str) -> PlaybookImportResponse:
        """Download playbook from registry, auto-import missing roles, write locally."""
        resp = await self._request(session, "POST", f"/playbooks/{slug}/download")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise

        version = RegistryPlaybookVersion.model_validate(resp.json())
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        meta = read_meta(layout)

        for pb in list_local_playbooks(layout):
            pb_meta_check = get_playbook_meta(meta, pb.id)
            existing_uuid = str(pb_meta_check.get("registry_uuid", pb_meta_check.get("registry_id", "")))
            if existing_uuid == str(version.playbook_id):
                return PlaybookImportResponse(
                    slug=slug, name=version.name,
                    message="Playbook already exists locally",
                )

        # Build a mapping of registry_uuid -> local_role_id
        local_roles = list_local_roles(layout)
        registry_to_local: dict[str, str] = {}
        for r in local_roles:
            rmeta = get_role_meta(meta, r.id)
            rid = str(rmeta.get("registry_uuid", rmeta.get("registry_id", "")))
            if rid:
                registry_to_local[rid] = r.id

        # Auto-import any roles not yet present locally
        for role_ref in version.roles:
            rid = role_ref.registry_role_id
            if rid not in registry_to_local:
                logger.info("auto_importing_role_for_playbook", registry_role_id=rid, playbook_slug=slug)
                role_resp = await self._request(session, "GET", f"/roles/by-id/{rid}")
                role_resp.raise_for_status()
                role_data = RegistryRole.model_validate(role_resp.json())
                role_slug = role_data.slug

                await self.import_role(session, role_slug)
                meta = read_meta(layout)
                new_local_roles = list_local_roles(layout)
                for r in new_local_roles:
                    rmeta = get_role_meta(meta, r.id)
                    r_rid = str(rmeta.get("registry_uuid", rmeta.get("registry_id", "")))
                    if r_rid == str(rid):
                        registry_to_local[str(rid)] = r.id
                        break

        # Build local playbook role entries — fail if any role is unresolved
        ansible_roles: list[AnsiblePlaybookRoleEntry] = []
        for role_ref in version.roles:
            local_id = registry_to_local.get(role_ref.registry_role_id)
            if local_id is None:
                raise ValueError(
                    f"Could not resolve registry role {role_ref.registry_role_id} "
                    f"to a local role during playbook import"
                )
            ansible_roles.append(AnsiblePlaybookRoleEntry(
                role=local_id,
                vars=role_ref.vars,
            ))

        existing_ids = {p.stem for p in layout.playbooks_path.glob("*.yml")} if layout.playbooks_path.is_dir() else set()
        playbook_id = generate_unique_id("pb", lambda c: c in existing_ids)

        playbook_data = PlaybookData(
            id=playbook_id,
            path=layout.playbooks_path / f"{playbook_id}.yml",
            name=version.name,
            description=version.description,
            hosts="all",
            gather_facts=True,
            become=version.become,
            roles=ansible_roles,
            raw_content="",
        )
        write_playbook(layout, playbook_data)

        # Re-read after write_playbook (which does its own read/write cycle)
        meta = read_meta(layout)
        pb_meta = get_playbook_meta(meta, playbook_id)
        pb_meta["registry_id"] = slug
        pb_meta["registry_uuid"] = version.playbook_id
        pb_meta["registry_version"] = version.version_number
        set_playbook_meta(meta, playbook_id, pb_meta)
        write_meta(layout, meta)

        if version.download_event_id:
            try:
                await self._request(
                    session, "POST", f"/playbooks/{slug}/confirm-download",
                    json_body={"download_event_id": version.download_event_id},
                )
            except Exception:
                logger.warning("confirm_download_failed", slug=slug, exc_info=True)

        # Git commit and push
        binding = repos_manager.current_repo(session)
        if binding:
            remote_url = (
                f"https://x-access-token:{session.access_token}"
                f"@github.com/{binding.owner}/{binding.repo}.git"
            )
            await arun_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
            playbook_file = layout.playbooks_path / f"{playbook_id}.yml"
            racksmith_yml = layout.racksmith_base / ".racksmith.yml"
            await arun_git(repo_path, [
                "add",
                str(playbook_file.relative_to(repo_path)),
                str(racksmith_yml.relative_to(repo_path)),
            ])
            await arun_git(
                repo_path,
                [
                    "-c",
                    f"user.name={settings.GIT_COMMIT_USER_NAME}",
                    "-c",
                    f"user.email={settings.GIT_COMMIT_USER_EMAIL}",
                    "commit",
                    "-m",
                    f"Import playbook from registry: {slug}",
                ],
                check=False,
            )
            await arun_git(repo_path, ["push", "origin", settings.GIT_RACKSMITH_BRANCH], check=False)

        logger.info("playbook_imported_from_registry", slug=slug, version=version.version_number)
        return PlaybookImportResponse(
            slug=slug,
            name=version.name,
            message="Playbook imported and pushed to GitHub",
        )

    async def delete_playbook(self, session: SessionData, slug: str) -> None:
        resp = await self._request(session, "DELETE", f"/playbooks/{slug}")
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning("registry_request_failed", slug=slug, status_code=exc.response.status_code, error=str(exc), exc_info=True)
            raise
        logger.info("registry_playbook_deleted", slug=slug)
        await _cache_invalidate()


registry_manager = RegistryManager()
