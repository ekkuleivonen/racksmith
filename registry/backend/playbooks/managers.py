from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.types import Boolean

from db.models import (
    DownloadEvent,
    PlaybookVersion,
    PlaybookVersionRole,
    RegistryPlaybook,
    RegistryRole,
    User,
)
from playbooks.schemas import PlaybookCreate, PlaybookUpdate

logger = structlog.get_logger()


async def _validate_and_create_role_entries(
    session: AsyncSession, role_refs: list[dict], playbook_version_id: str | UUID,
) -> None:
    """Validate role references exist and create PlaybookVersionRole rows."""
    for position, ref in enumerate(role_refs):
        role_uuid = UUID(str(ref["registry_role_id"]))
        role_result = await session.execute(
            select(RegistryRole.id).where(RegistryRole.id == role_uuid)
        )
        if role_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail=f"Referenced role {role_uuid} not found in registry")

        entry = PlaybookVersionRole(
            playbook_version_id=playbook_version_id,
            role_id=role_uuid,
            position=position,
            vars=ref.get("vars", {}),
        )
        session.add(entry)


async def list_playbooks(
    session: AsyncSession,
    *,
    q: str | None = None,
    tags: list[str] | None = None,
    owner: str | None = None,
    sort: str = "recent",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[RegistryPlaybook], int]:
    latest_ver = (
        select(
            PlaybookVersion.playbook_id,
            func.max(PlaybookVersion.version_number).label("max_ver"),
        )
        .group_by(PlaybookVersion.playbook_id)
        .subquery()
    )

    stmt = (
        select(RegistryPlaybook)
        .join(latest_ver, RegistryPlaybook.id == latest_ver.c.playbook_id)
        .join(
            PlaybookVersion,
            (PlaybookVersion.playbook_id == RegistryPlaybook.id)
            & (PlaybookVersion.version_number == latest_ver.c.max_ver),
        )
        .options(
            selectinload(RegistryPlaybook.owner),
            selectinload(RegistryPlaybook.versions)
            .selectinload(PlaybookVersion.role_entries)
            .selectinload(PlaybookVersionRole.role)
            .selectinload(RegistryRole.versions),
        )
    )

    ts_query = None
    if q:
        ts_query = func.plainto_tsquery(literal_column("'english'::regconfig"), q)
        stmt = stmt.where(
            RegistryPlaybook.versions.any(
                PlaybookVersion.search_vector.op("@@")(ts_query).cast(Boolean)
            )
        )

    if tags:
        for tag in tags:
            stmt = stmt.where(
                RegistryPlaybook.versions.any(PlaybookVersion.tags.any(tag))  # type: ignore[arg-type]
            )

    if owner:
        stmt = stmt.join(User).where(User.username == owner)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    if q and ts_query is not None and sort in ("recent", "relevance"):
        rank = func.ts_rank(PlaybookVersion.search_vector, ts_query)
        stmt = stmt.order_by(rank.desc())
    elif sort == "downloads":
        dl_count = (
            select(func.count())
            .select_from(DownloadEvent)
            .where(DownloadEvent.playbook_id == RegistryPlaybook.id, DownloadEvent.confirmed.is_(True))
            .correlate(RegistryPlaybook)
            .scalar_subquery()
        )
        stmt = stmt.order_by(dl_count.desc())
    elif sort == "name":
        latest_name = (
            select(PlaybookVersion.name)
            .where(PlaybookVersion.playbook_id == RegistryPlaybook.id)
            .order_by(PlaybookVersion.version_number.desc())
            .limit(1)
            .correlate(RegistryPlaybook)
            .scalar_subquery()
        )
        stmt = stmt.order_by(latest_name.asc())
    else:
        stmt = stmt.order_by(RegistryPlaybook.created_at.desc())

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(stmt)
    return list(result.scalars().unique().all()), total


async def get_facets(
    session: AsyncSession,
) -> dict[str, list[dict[str, str | int]]]:
    """Aggregate tags across all latest playbook versions using SQL."""
    from sqlalchemy import text

    tag_result = await session.execute(
        text("""
            SELECT tag, count(*) AS cnt
            FROM playbook_versions pv,
                 LATERAL unnest(pv.tags) AS tag
            WHERE pv.id IN (
                SELECT pv2.id
                FROM playbook_versions pv2
                JOIN (
                    SELECT playbook_id, max(version_number) AS max_ver
                    FROM playbook_versions GROUP BY playbook_id
                ) lv ON pv2.playbook_id = lv.playbook_id AND pv2.version_number = lv.max_ver
            )
            GROUP BY tag
            ORDER BY cnt DESC
        """)
    )
    tags_list: list[dict[str, str | int]] = [
        {"name": row[0], "count": row[1]} for row in tag_result.all()
    ]
    return {"tags": tags_list}


async def get_playbook(session: AsyncSession, playbook_id: str | UUID) -> RegistryPlaybook:
    result = await session.execute(
        select(RegistryPlaybook)
        .where(RegistryPlaybook.id == playbook_id)
        .options(
            selectinload(RegistryPlaybook.owner),
            selectinload(RegistryPlaybook.versions)
            .selectinload(PlaybookVersion.role_entries)
            .selectinload(PlaybookVersionRole.role)
            .selectinload(RegistryRole.versions),
        )
    )
    playbook = result.scalar_one_or_none()
    if playbook is None:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return playbook


async def create_playbook(
    session: AsyncSession, data: PlaybookCreate, user: User
) -> RegistryPlaybook:
    playbook = RegistryPlaybook(owner_id=user.id)
    session.add(playbook)
    await session.flush()

    version = PlaybookVersion(
        playbook_id=playbook.id,
        version_number=1,
        name=data.name,
        description=data.description,
        become=data.become,
        tags=data.tags,
    )
    session.add(version)
    await session.flush()

    roles_dicts = [r.model_dump(mode="json") for r in data.roles]
    await _validate_and_create_role_entries(session, roles_dicts, version.id)

    await session.commit()

    return await get_playbook(session, playbook.id)


async def update_playbook(
    session: AsyncSession, playbook_id: str | UUID, data: PlaybookUpdate, user: User
) -> RegistryPlaybook:
    playbook = await get_playbook(session, playbook_id)
    if playbook.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can edit this playbook")

    latest = playbook.versions[0] if playbook.versions else None
    next_num = (latest.version_number + 1) if latest else 1

    roles_dicts: list[dict]
    if data.roles is not None:
        roles_dicts = [r.model_dump(mode="json") for r in data.roles]
    elif latest and latest.role_entries:
        roles_dicts = [
            {"registry_role_id": str(re.role_id), "vars": re.vars or {}}
            for re in latest.role_entries
        ]
    else:
        roles_dicts = []

    version = PlaybookVersion(
        playbook_id=playbook.id,
        version_number=next_num,
        name=data.name or (latest.name if latest else str(playbook_id)),
        description=data.description if data.description is not None else (latest.description if latest else ""),
        become=data.become if data.become is not None else (latest.become if latest else False),
        tags=data.tags if data.tags is not None else (latest.tags if latest else []),
    )
    session.add(version)
    await session.flush()

    await _validate_and_create_role_entries(session, roles_dicts, version.id)
    await session.commit()

    return await get_playbook(session, playbook_id)


async def upsert_playbook(
    session: AsyncSession, data: PlaybookCreate, user: User
) -> tuple[RegistryPlaybook, bool]:
    """Create a new playbook (always). Returns (playbook, created=True)."""
    playbook = await create_playbook(session, data, user)
    return playbook, True


async def delete_playbook(session: AsyncSession, playbook_id: str | UUID, user: User) -> None:
    playbook = await get_playbook(session, playbook_id)
    is_owner = playbook.owner_id == user.id
    is_admin = user.access_level in ("admin", "system")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can delete this playbook")

    await session.delete(playbook)
    await session.commit()


async def download_playbook(
    session: AsyncSession, playbook_id: str | UUID,
) -> tuple[PlaybookVersion, DownloadEvent]:
    playbook = await get_playbook(session, playbook_id)

    event = DownloadEvent(playbook_id=playbook.id, confirmed=False)
    session.add(event)
    await session.flush()

    if not playbook.versions:
        raise HTTPException(status_code=404, detail="No version found")

    version = playbook.versions[0]
    await session.commit()
    return version, event
