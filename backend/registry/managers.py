"""Registry proxy: forward requests with GitHub token, push/import logic."""

from __future__ import annotations

from pathlib import Path

import httpx
import settings
import yaml
from github.misc import RACKSMITH_BRANCH, run_git
from repos.managers import repos_manager
from roles.managers import role_manager

from registry.schemas import (
    RegistryRole,
    RegistryRoleList,
    RegistryVersion,
    RoleCreate,
    RoleImportResponse,
    RoleUpdate,
)

ROLES_DIR = Path(".racksmith/roles")


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
    """Read local action, serialize, POST (new) or PUT (update) to registry."""
    detail = role_manager.get_role_detail(session, slug)
    repo_path = repos_manager.active_repo_path(session)
    role_dir = repo_path / ROLES_DIR / slug

    tasks_yaml = detail.tasks_content
    defaults_yaml = ""
    defaults_file = role_dir / "defaults" / "main.yml"
    if defaults_file.is_file():
        defaults_yaml = defaults_file.read_text(encoding="utf-8")

    meta_yaml = ""
    meta_file = role_dir / "meta" / "main.yml"
    if meta_file.is_file():
        meta_yaml = meta_file.read_text(encoding="utf-8")

    payload = RoleCreate(
        name=detail.name,
        racksmith_version=settings.RACKSMITH_VERSION,
        description=detail.description,
        platforms=detail.compatibility.get("os_family", []),
        tags=detail.labels,
        inputs=detail.inputs,
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
    """Download from registry, write to local repo as action."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.REGISTRY_URL}/roles/{slug}/download",
            params={"racksmith_version": settings.RACKSMITH_VERSION},
            headers=_headers(session),
        )
        resp.raise_for_status()

    version = RegistryVersion.model_validate(resp.json())
    repo_path = repos_manager.active_repo_path(session)
    dest = repo_path / ROLES_DIR / slug

    dest.mkdir(parents=True, exist_ok=True)

    manifest = {
        "slug": slug,
        "name": version.name,
        "description": version.description,
        "inputs": version.inputs,
        "labels": version.tags,
        "compatibility": {"os_family": version.platforms},
    }
    (dest / "action.yaml").write_text(
        yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )

    (dest / "tasks").mkdir(exist_ok=True)
    (dest / "tasks" / "main.yml").write_text(
        version.tasks_yaml or "---\n# Add tasks here\n",
        encoding="utf-8",
    )

    if version.defaults_yaml:
        (dest / "defaults").mkdir(exist_ok=True)
        (dest / "defaults" / "main.yml").write_text(
            version.defaults_yaml,
            encoding="utf-8",
        )

    if version.meta_yaml:
        (dest / "meta").mkdir(exist_ok=True)
        (dest / "meta" / "main.yml").write_text(
            version.meta_yaml,
            encoding="utf-8",
        )

    binding = repos_manager.current_repo(session)
    if binding:
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["add", str(dest.relative_to(repo_path))])
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
