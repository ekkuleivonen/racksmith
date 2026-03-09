from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from db.engine import get_db
from db.models import User
from roles import managers
from roles.schemas import (
    RoleCreate,
    RoleListOut,
    RoleOut,
    RoleUpdate,
    VersionOut,
)

router = APIRouter()


def _role_to_out(role) -> RoleOut:
    latest = role.versions[0] if role.versions else None
    return RoleOut(
        id=role.id,
        slug=role.slug,
        owner=role.owner,
        download_count=role.download_count,
        created_at=role.created_at,
        updated_at=role.updated_at,
        latest_version=latest,
    )


@router.get("/roles", response_model=RoleListOut)
async def list_roles(
    racksmith_version: str = Query(...),
    q: str | None = Query(None),
    tags: str | None = Query(None),
    owner: str | None = Query(None),
    sort: str = Query("recent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    roles, total = await managers.list_roles(
        session,
        racksmith_version=racksmith_version,
        q=q,
        tags=tag_list,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )
    return RoleListOut(
        items=[_role_to_out(r) for r in roles],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/roles/{slug}", response_model=RoleOut)
async def get_role(
    slug: str,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    role = await managers.get_role(session, slug)
    return _role_to_out(role)


@router.get("/roles/{slug}/versions", response_model=list[VersionOut])
async def list_versions(
    slug: str,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    role = await managers.get_role(session, slug)
    return role.versions


@router.post("/roles", response_model=RoleOut, status_code=201)
async def create_role(
    data: RoleCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await managers.create_role(session, data, user)
    return _role_to_out(role)


@router.put("/roles/{slug}", response_model=RoleOut)
async def update_role(
    slug: str,
    data: RoleUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await managers.update_role(session, slug, data, user)
    return _role_to_out(role)


@router.delete("/roles/{slug}", status_code=204)
async def delete_role(
    slug: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await managers.delete_role(session, slug, user)


@router.post("/roles/{slug}/download", response_model=VersionOut)
async def download_role(
    slug: str,
    racksmith_version: str | None = Query(None),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await managers.download_role(session, slug, racksmith_version)
