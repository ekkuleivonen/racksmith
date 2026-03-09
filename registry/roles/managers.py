import re
import unicodedata

import structlog
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import RegistryRole, RoleVersion, User
from roles.schemas import RoleCreate, RoleUpdate

logger = structlog.get_logger()


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")


async def list_roles(
    session: AsyncSession,
    *,
    racksmith_version: str,
    q: str | None = None,
    tags: list[str] | None = None,
    owner: str | None = None,
    sort: str = "recent",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[RegistryRole], int]:
    major = racksmith_version.split(".")[0]

    # Sub-query: latest version per role that matches major version
    latest_ver = (
        select(
            RoleVersion.role_id,
            func.max(RoleVersion.version_number).label("max_ver"),
        )
        .where(func.split_part(RoleVersion.racksmith_version, ".", 1) == major)
        .group_by(RoleVersion.role_id)
        .subquery()
    )

    stmt = (
        select(RegistryRole)
        .join(latest_ver, RegistryRole.id == latest_ver.c.role_id)
        .options(selectinload(RegistryRole.owner), selectinload(RegistryRole.versions))
    )

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            RegistryRole.slug.ilike(pattern)
            | RegistryRole.versions.any(RoleVersion.name.ilike(pattern))
            | RegistryRole.versions.any(RoleVersion.description.ilike(pattern))
            | RegistryRole.versions.any(RoleVersion.tags.any(q))
        )

    if tags:
        for tag in tags:
            stmt = stmt.where(
                RegistryRole.versions.any(RoleVersion.tags.any(tag))
            )

    if owner:
        stmt = stmt.join(User).where(User.username == owner)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    order = {
        "downloads": RegistryRole.download_count.desc(),
        "name": RegistryRole.slug.asc(),
    }.get(sort, RegistryRole.created_at.desc())
    stmt = stmt.order_by(order).offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(stmt)
    return list(result.scalars().unique().all()), total


async def get_role(session: AsyncSession, slug: str) -> RegistryRole:
    result = await session.execute(
        select(RegistryRole)
        .where(RegistryRole.slug == slug)
        .options(selectinload(RegistryRole.owner), selectinload(RegistryRole.versions))
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


async def create_role(
    session: AsyncSession, data: RoleCreate, user: User
) -> RegistryRole:
    slug = _slugify(data.name)

    existing = await session.execute(
        select(RegistryRole).where(RegistryRole.slug == slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role with this name already exists")

    role = RegistryRole(slug=slug, owner_id=user.id)
    session.add(role)
    await session.flush()

    version = RoleVersion(
        role_id=role.id,
        version_number=1,
        racksmith_version=data.racksmith_version,
        name=data.name,
        description=data.description,
        platforms=data.platforms,
        tags=data.tags,
        inputs=data.inputs,
        tasks_yaml=data.tasks_yaml,
        defaults_yaml=data.defaults_yaml,
        meta_yaml=data.meta_yaml,
    )
    session.add(version)
    await session.commit()

    return await get_role(session, slug)


async def update_role(
    session: AsyncSession, slug: str, data: RoleUpdate, user: User
) -> RegistryRole:
    role = await get_role(session, slug)
    if role.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can edit this role")

    latest = role.versions[0] if role.versions else None
    next_num = (latest.version_number + 1) if latest else 1

    version = RoleVersion(
        role_id=role.id,
        version_number=next_num,
        racksmith_version=data.racksmith_version,
        name=data.name or (latest.name if latest else slug),
        description=data.description if data.description is not None else (latest.description if latest else ""),
        platforms=data.platforms if data.platforms is not None else (latest.platforms if latest else []),
        tags=data.tags if data.tags is not None else (latest.tags if latest else []),
        inputs=data.inputs if data.inputs is not None else (latest.inputs if latest else []),
        tasks_yaml=data.tasks_yaml if data.tasks_yaml is not None else (latest.tasks_yaml if latest else ""),
        defaults_yaml=data.defaults_yaml if data.defaults_yaml is not None else (latest.defaults_yaml if latest else ""),
        meta_yaml=data.meta_yaml if data.meta_yaml is not None else (latest.meta_yaml if latest else ""),
    )
    session.add(version)
    await session.commit()

    return await get_role(session, slug)


async def delete_role(session: AsyncSession, slug: str, user: User) -> None:
    if user.access_level != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete roles")

    role = await get_role(session, slug)
    await session.delete(role)
    await session.commit()


async def download_role(
    session: AsyncSession, slug: str, racksmith_version: str | None = None
) -> RoleVersion:
    role = await get_role(session, slug)

    role.download_count = (role.download_count or 0) + 1
    await session.flush()

    version = None
    if racksmith_version:
        major = racksmith_version.split(".")[0]
        for v in role.versions:
            if v.racksmith_version.split(".")[0] == major:
                version = v
                break

    if version is None and role.versions:
        version = role.versions[0]

    if version is None:
        raise HTTPException(status_code=404, detail="No compatible version found")

    await session.commit()
    return version
