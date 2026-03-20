from uuid import UUID as StdUUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from db.engine import get_db
from db.models import User
from rate_limit import limiter
from roles import managers
from roles.schemas import (
    ConfirmDownloadRequest,
    FacetsOut,
    RoleCreate,
    RoleListOut,
    RoleOut,
    RoleUpdate,
    VersionOut,
)

router = APIRouter()


def _version_to_out(v, *, download_event_id: StdUUID | str | None = None) -> VersionOut:
    eid = StdUUID(str(download_event_id)) if download_event_id is not None else None
    return VersionOut(
        id=v.id,
        role_id=v.role_id,
        version_number=v.version_number,
        name=v.name,
        description=v.description,
        platforms=v.platforms,
        tags=v.tags,
        inputs=v.inputs,
        tasks_yaml=v.tasks_yaml,
        defaults_yaml=v.defaults_yaml,
        meta_yaml=v.meta_yaml,
        created_at=v.created_at,
        download_event_id=eid,
    )


async def _role_to_out(
    role, session: AsyncSession, *, playbook_download_count: int = 0,
) -> RoleOut:
    latest = role.versions[0] if role.versions else None
    dl_count = await managers._confirmed_download_count(session, role_id=role.id)
    return RoleOut(
        id=role.id,
        owner=role.owner,
        download_count=dl_count,
        playbook_download_count=playbook_download_count,
        created_at=role.created_at,
        updated_at=role.updated_at,
        latest_version=_version_to_out(latest) if latest else None,
    )


@router.get("/roles/facets", response_model=FacetsOut)
async def get_facets(
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await managers.get_facets(session)


@router.get("/roles", response_model=RoleListOut)
async def list_roles(
    q: str | None = Query(None),
    tags: str | None = Query(None),
    platforms: str | None = Query(None),
    owner: str | None = Query(None),
    sort: str = Query("recent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    platform_list = [p.strip() for p in platforms.split(",") if p.strip()] if platforms else None
    roles, total = await managers.list_roles(
        session,
        q=q,
        tags=tag_list,
        platforms=platform_list,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )
    pb_counts = await managers.get_playbook_download_counts(
        session, [r.id for r in roles]
    )
    return RoleListOut(
        items=[
            await _role_to_out(r, session, playbook_download_count=pb_counts.get(str(r.id), 0))
            for r in roles
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/roles/{role_id}", response_model=RoleOut)
async def get_role(
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    role = await managers.get_role(session, role_id)
    pb_count = await managers.get_playbook_download_count(session, role.id)
    return await _role_to_out(role, session, playbook_download_count=pb_count)


@router.get("/roles/{role_id}/versions", response_model=list[VersionOut])
async def list_versions(
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    role = await managers.get_role(session, role_id)
    return [_version_to_out(v) for v in role.versions]


@router.post("/roles", response_model=RoleOut, status_code=201)
@limiter.limit("10/minute")
async def create_role(
    request: Request,
    data: RoleCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await managers.create_role(session, data, user)
    return await _role_to_out(role, session)


@router.put("/roles", response_model=RoleOut)
@limiter.limit("20/minute")
async def upsert_role(
    request: Request,
    data: RoleCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role, created = await managers.upsert_role(session, data, user)
    out = await _role_to_out(role, session)
    if created:
        from starlette.responses import JSONResponse
        return JSONResponse(content=out.model_dump(mode="json"), status_code=201)
    return out


@router.put("/roles/{role_id}", response_model=RoleOut)
@limiter.limit("20/minute")
async def update_role(
    request: Request,
    data: RoleUpdate,
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await managers.update_role(session, role_id, data, user)
    return await _role_to_out(role, session)


@router.delete("/roles/{role_id}", status_code=204)
@limiter.limit("10/minute")
async def delete_role(
    request: Request,
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await managers.delete_role(session, role_id, user)


@router.post("/roles/{role_id}/download", response_model=VersionOut)
async def download_role(
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    version, event = await managers.download_role(session, role_id)
    return _version_to_out(version, download_event_id=event.id)


@router.post("/roles/{role_id}/confirm-download", status_code=204)
async def confirm_role_download(
    data: ConfirmDownloadRequest,
    role_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await managers.confirm_download(session, data.download_event_id)
