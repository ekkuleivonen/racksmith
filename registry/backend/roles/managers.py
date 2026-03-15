import json
import re
import unicodedata
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import cast, func, literal, literal_column, or_, select, text, type_coerce
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.types import Boolean

from db.models import (
    DownloadEvent,
    PlaybookVersion,
    PlaybookVersionRole,
    RegistryPlaybook,
    RegistryRole,
    RoleVersion,
    User,
)
from roles.schemas import RoleCreate, RoleUpdate

logger = structlog.get_logger()

PLATFORM_FAMILIES: dict[str, list[str]] = {
    "debian": ["debian", "ubuntu", "raspbian", "mint"],
    "redhat": ["redhat", "rhel", "centos", "fedora", "rocky", "alma"],
    "arch": ["arch", "manjaro"],
}


def _expand_platforms(families: list[str]) -> list[str]:
    """Expand os_family names into all known distro names for matching."""
    names: list[str] = []
    for fam in families:
        lower = fam.lower()
        if lower in PLATFORM_FAMILIES:
            names.extend(PLATFORM_FAMILIES[lower])
        else:
            names.append(lower)
    return list(set(names))


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")


async def _confirmed_download_count(
    session: AsyncSession, *, role_id: object | None = None, playbook_id: object | None = None
) -> int:
    stmt = select(func.count()).select_from(DownloadEvent).where(DownloadEvent.confirmed.is_(True))
    if role_id is not None:
        stmt = stmt.where(DownloadEvent.role_id == role_id)
    if playbook_id is not None:
        stmt = stmt.where(DownloadEvent.playbook_id == playbook_id)
    return (await session.execute(stmt)).scalar_one()


async def list_roles(
    session: AsyncSession,
    *,
    q: str | None = None,
    tags: list[str] | None = None,
    platforms: list[str] | None = None,
    owner: str | None = None,
    sort: str = "recent",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[RegistryRole], int]:
    latest_ver = (
        select(
            RoleVersion.role_id,
            func.max(RoleVersion.version_number).label("max_ver"),
        )
        .group_by(RoleVersion.role_id)
        .subquery()
    )

    stmt = (
        select(RegistryRole)
        .join(latest_ver, RegistryRole.id == latest_ver.c.role_id)
        .options(
            selectinload(RegistryRole.owner),
            selectinload(RegistryRole.versions),
        )
    )

    ts_query = None
    if q:
        ts_query = func.plainto_tsquery(literal_column("'english'::regconfig"), q)
        stmt = stmt.where(
            RegistryRole.versions.any(
                type_coerce(RoleVersion.search_vector.op("@@")(ts_query), Boolean)
            )
        )

    if tags:
        for tag in tags:
            stmt = stmt.where(
                RegistryRole.versions.any(RoleVersion.tags.any(tag))  # type: ignore[arg-type]
            )

    if platforms:
        expanded = _expand_platforms(platforms)
        platform_conditions = []
        for name in expanded:
            safe_json = json.dumps([{"name": name}])
            platform_conditions.append(
                RegistryRole.versions.any(
                    type_coerce(
                        RoleVersion.platforms.op("@>")(
                            cast(literal(safe_json), JSONB)
                        ),
                        Boolean,
                    )
                )
            )
        if platform_conditions:
            stmt = stmt.where(or_(*platform_conditions))

    if owner:
        stmt = stmt.join(User).where(User.username == owner)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    if q and ts_query is not None and sort in ("recent", "relevance"):
        rank = func.ts_rank(RoleVersion.search_vector, ts_query)
        stmt = stmt.join(RoleVersion, RegistryRole.id == RoleVersion.role_id, isouter=True).order_by(rank.desc())
    elif sort == "downloads":
        dl_count = (
            select(func.count())
            .select_from(DownloadEvent)
            .where(DownloadEvent.role_id == RegistryRole.id, DownloadEvent.confirmed.is_(True))
            .correlate(RegistryRole)
            .scalar_subquery()
        )
        stmt = stmt.order_by(dl_count.desc())
    elif sort == "name":
        stmt = stmt.order_by(RegistryRole.slug.asc())
    else:
        stmt = stmt.order_by(RegistryRole.created_at.desc())

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(stmt)
    return list(result.scalars().unique().all()), total


async def get_facets(
    session: AsyncSession,
) -> dict[str, list[dict[str, str | int]]]:
    """Aggregate tags and platforms across all latest role versions using SQL."""
    tag_result = await session.execute(
        text("""
            SELECT tag, count(*) AS cnt
            FROM role_versions rv,
                 LATERAL unnest(rv.tags) AS tag
            WHERE rv.id IN (
                SELECT rv2.id
                FROM role_versions rv2
                JOIN (
                    SELECT role_id, max(version_number) AS max_ver
                    FROM role_versions GROUP BY role_id
                ) lv ON rv2.role_id = lv.role_id AND rv2.version_number = lv.max_ver
            )
            GROUP BY tag
            ORDER BY cnt DESC
        """)
    )
    tags_list: list[dict[str, str | int]] = [
        {"name": row[0], "count": row[1]} for row in tag_result.all()
    ]

    platform_result = await session.execute(
        text("""
            SELECT lower(p->>'name') AS pname, count(*) AS cnt
            FROM role_versions rv,
                 LATERAL jsonb_array_elements(rv.platforms) AS p
            WHERE rv.id IN (
                SELECT rv2.id
                FROM role_versions rv2
                JOIN (
                    SELECT role_id, max(version_number) AS max_ver
                    FROM role_versions GROUP BY role_id
                ) lv ON rv2.role_id = lv.role_id AND rv2.version_number = lv.max_ver
            )
            AND p->>'name' IS NOT NULL AND p->>'name' != ''
            GROUP BY pname
            ORDER BY cnt DESC
        """)
    )
    platforms_list: list[dict[str, str | int]] = [
        {"name": row[0], "count": row[1]} for row in platform_result.all()
    ]

    return {"tags": tags_list, "platforms": platforms_list}


async def get_role(session: AsyncSession, slug: str) -> RegistryRole:
    result = await session.execute(
        select(RegistryRole)
        .where(RegistryRole.slug == slug)
        .options(
            selectinload(RegistryRole.owner),
            selectinload(RegistryRole.versions),
        )
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


async def get_role_by_uuid(session: AsyncSession, role_uuid: UUID) -> RegistryRole:
    result = await session.execute(
        select(RegistryRole)
        .where(RegistryRole.id == role_uuid)
        .options(
            selectinload(RegistryRole.owner),
            selectinload(RegistryRole.versions),
        )
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


async def get_playbook_download_count(session: AsyncSession, role_id: object) -> int:
    """Sum confirmed download events of all playbooks whose latest version references this role."""
    counts = await get_playbook_download_counts(session, [role_id])
    return counts.get(str(role_id), 0)


async def get_playbook_download_counts(
    session: AsyncSession, role_ids: list[object],
) -> dict[str, int]:
    """Batch: map role_id -> sum of playbook confirmed downloads referencing that role."""
    if not role_ids:
        return {}

    role_id_strs = {str(rid) for rid in role_ids}

    latest_ver = (
        select(
            PlaybookVersion.playbook_id,
            func.max(PlaybookVersion.version_number).label("max_ver"),
        )
        .group_by(PlaybookVersion.playbook_id)
        .subquery()
    )

    stmt = (
        select(
            PlaybookVersionRole.role_id,
            func.count(DownloadEvent.id).label("dl_count"),
        )
        .select_from(PlaybookVersionRole)
        .join(PlaybookVersion, PlaybookVersionRole.playbook_version_id == PlaybookVersion.id)
        .join(
            latest_ver,
            (PlaybookVersion.playbook_id == latest_ver.c.playbook_id)
            & (PlaybookVersion.version_number == latest_ver.c.max_ver),
        )
        .join(
            DownloadEvent,
            (DownloadEvent.playbook_id == PlaybookVersion.playbook_id)
            & (DownloadEvent.confirmed.is_(True)),
        )
        .where(PlaybookVersionRole.role_id.in_(role_ids))
        .group_by(PlaybookVersionRole.role_id)
    )

    result = await session.execute(stmt)
    counts: dict[str, int] = {}
    for rid, dl_count in result.all():
        rid_str = str(rid)
        if rid_str in role_id_strs:
            counts[rid_str] = dl_count
    return counts


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
        name=data.name,
        description=data.description,
        platforms=[p.model_dump() for p in data.platforms],
        tags=data.tags,
        inputs=[i.model_dump() for i in data.inputs],
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

    platforms = data.platforms if data.platforms is not None else (latest.platforms if latest else [])
    inputs = data.inputs if data.inputs is not None else (latest.inputs if latest else [])
    version = RoleVersion(
        role_id=role.id,
        version_number=next_num,
        name=data.name or (latest.name if latest else slug),
        description=data.description if data.description is not None else (latest.description if latest else ""),
        platforms=[p.model_dump() if hasattr(p, "model_dump") else p for p in platforms],
        tags=data.tags if data.tags is not None else (latest.tags if latest else []),
        inputs=[i.model_dump() if hasattr(i, "model_dump") else i for i in inputs],
        tasks_yaml=data.tasks_yaml if data.tasks_yaml is not None else (latest.tasks_yaml if latest else ""),
        defaults_yaml=data.defaults_yaml if data.defaults_yaml is not None else (latest.defaults_yaml if latest else ""),
        meta_yaml=data.meta_yaml if data.meta_yaml is not None else (latest.meta_yaml if latest else ""),
    )
    session.add(version)
    await session.commit()

    return await get_role(session, slug)


async def delete_role(session: AsyncSession, slug: str, user: User) -> None:
    role = await get_role(session, slug)
    is_owner = role.owner_id == user.id
    is_admin = user.access_level in ("admin", "system")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can delete this role")

    ref_result = await session.execute(
        select(RegistryPlaybook.slug)
        .join(PlaybookVersion, RegistryPlaybook.id == PlaybookVersion.playbook_id)
        .join(PlaybookVersionRole, PlaybookVersion.id == PlaybookVersionRole.playbook_version_id)
        .where(PlaybookVersionRole.role_id == role.id)
        .distinct()
    )
    playbook_slugs = list(ref_result.scalars().all())
    if playbook_slugs:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role '{slug}': referenced by playbooks: {', '.join(playbook_slugs)}",
        )

    await session.delete(role)
    await session.commit()


async def download_role(
    session: AsyncSession, slug: str,
) -> tuple[RoleVersion, DownloadEvent]:
    role = await get_role(session, slug)

    event = DownloadEvent(role_id=role.id, confirmed=False)
    session.add(event)
    await session.flush()

    if not role.versions:
        raise HTTPException(status_code=404, detail="No version found")

    version = role.versions[0]
    await session.commit()
    return version, event


async def confirm_download(session: AsyncSession, download_event_id: str | UUID) -> None:
    result = await session.execute(
        select(DownloadEvent).where(DownloadEvent.id == download_event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Download event not found")
    event.confirmed = True
    await session.commit()
