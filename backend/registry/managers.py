"""Registry proxy: forward requests with GitHub token, push/import logic."""

from __future__ import annotations

import httpx
import settings
from ansible import resolve_layout
from ansible.roles import (
    RoleData,
    RoleInput,
    read_role,
    read_role_tasks,
    write_role,
)
from github.misc import RACKSMITH_BRANCH, run_git
from repos.managers import repos_manager

from registry.schemas import (
    RegistryRole,
    RegistryRoleList,
    RegistryVersion,
    RoleCreate,
    RoleImportResponse,
    RoleUpdate,
)


def _headers(session) -> dict[str, str]:
    return {"Authorization": f"Bearer {session.access_token}"}


async def list_roles(
    session,
    *,
    racksmith_version: str,
    q: str | None = None,
    tags: str | None = None,
    owner: str | None = None,
    sort: str = "recent",
    page: int = 1,
    per_page: int = 20,
) -> RegistryRoleList:
    params: dict[str, str | int] = {
        "racksmith_version": racksmith_version,
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

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.REGISTRY_URL}/roles",
            params=params,
            headers=_headers(session),
        )
        resp.raise_for_status()
    return RegistryRoleList.model_validate(resp.json())


async def get_role(session, slug: str) -> RegistryRole:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.REGISTRY_URL}/roles/{slug}",
            headers=_headers(session),
        )
        resp.raise_for_status()
    return RegistryRole.model_validate(resp.json())


async def get_versions(session, slug: str) -> list[RegistryVersion]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.REGISTRY_URL}/roles/{slug}/versions",
            headers=_headers(session),
        )
        resp.raise_for_status()
    return [RegistryVersion.model_validate(v) for v in resp.json()]


async def push_role(session, slug: str) -> RegistryRole:
    """Read local role via ansible module, serialize, POST or PUT to registry."""
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)
    role_dir = layout.roles_path / slug

    role = read_role(role_dir)
    if role is None:
        raise FileNotFoundError(f"Local role '{slug}' not found")

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

    platforms = [p.get("name", "") for p in role.platforms]
    inputs_list = [
        {
            "key": inp.key,
            "description": inp.description,
            "type": inp.type,
            "default": inp.default,
            "required": inp.required,
            "choices": inp.choices,
            "no_log": inp.no_log,
            "racksmith_label": inp.racksmith_label,
            "racksmith_placeholder": inp.racksmith_placeholder,
            "racksmith_interactive": inp.racksmith_interactive,
        }
        for inp in role.inputs
    ]

    payload = RoleCreate(
        name=role.name,
        racksmith_version=settings.RACKSMITH_VERSION,
        description=role.description,
        platforms=platforms,
        tags=role.tags,
        inputs=inputs_list,
        tasks_yaml=tasks_yaml,
        defaults_yaml=defaults_yaml,
        meta_yaml=meta_yaml,
    )

    async with httpx.AsyncClient() as client:
        existing = await client.get(
            f"{settings.REGISTRY_URL}/roles/{slug}",
            headers=_headers(session),
        )
        if existing.status_code == 200:
            update_payload = RoleUpdate(
                racksmith_version=payload.racksmith_version,
                name=payload.name,
                description=payload.description,
                platforms=payload.platforms,
                tags=payload.tags,
                inputs=payload.inputs,
                tasks_yaml=payload.tasks_yaml,
                defaults_yaml=payload.defaults_yaml,
                meta_yaml=payload.meta_yaml,
            )
            resp = await client.put(
                f"{settings.REGISTRY_URL}/roles/{slug}",
                json=update_payload.model_dump(),
                headers=_headers(session),
            )
        else:
            resp = await client.post(
                f"{settings.REGISTRY_URL}/roles",
                json=payload.model_dump(),
                headers=_headers(session),
            )

    resp.raise_for_status()
    return RegistryRole.model_validate(resp.json())


async def import_role(session, slug: str) -> RoleImportResponse:
    """Download from registry, write to local repo using ansible/roles module."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.REGISTRY_URL}/roles/{slug}/download",
            params={"racksmith_version": settings.RACKSMITH_VERSION},
            headers=_headers(session),
        )
        resp.raise_for_status()

    version = RegistryVersion.model_validate(resp.json())
    repo_path = repos_manager.active_repo_path(session)
    layout = resolve_layout(repo_path)

    platforms = [
        {"name": p} if isinstance(p, str) else p for p in (version.platforms or [])
    ]
    inputs = []
    for inp in version.inputs or []:
        if isinstance(inp, dict):
            inputs.append(
                RoleInput(
                    key=inp.get("key", ""),
                    description=inp.get("description", ""),
                    type=inp.get("type", "str"),
                    default=inp.get("default"),
                    required=inp.get("required", False),
                    choices=inp.get("choices", []) or [],
                    no_log=inp.get("no_log", False),
                    racksmith_label=inp.get("racksmith_label", ""),
                    racksmith_placeholder=inp.get("racksmith_placeholder", ""),
                    racksmith_interactive=inp.get("racksmith_interactive", False),
                )
            )

    role_data = RoleData(
        slug=slug,
        name=version.name,
        description=version.description,
        platforms=platforms,
        tags=version.tags or [],
        inputs=inputs,
        has_tasks=bool(version.tasks_yaml and version.tasks_yaml.strip()),
    )

    write_role(layout, role_data, tasks_yaml=version.tasks_yaml or None)

    if version.defaults_yaml:
        defaults_dir = layout.roles_path / slug / "defaults"
        defaults_dir.mkdir(parents=True, exist_ok=True)
        (defaults_dir / "main.yml").write_text(version.defaults_yaml, encoding="utf-8")

    role_dir = layout.roles_path / slug
    binding = repos_manager.current_repo(session)
    if binding:
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["add", str(role_dir.relative_to(repo_path))])
        run_git(
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
        run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH], check=False)

    return RoleImportResponse(
        slug=slug,
        name=version.name,
        message="Imported and pushed to GitHub",
    )


async def delete_role(session, slug: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{settings.REGISTRY_URL}/roles/{slug}",
            headers=_headers(session),
        )
        resp.raise_for_status()
