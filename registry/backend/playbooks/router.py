import re
from uuid import UUID as StdUUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from db.engine import get_db
from db.models import RegistryRole, User
from playbooks import managers
from playbooks.schemas import (
    ConfirmDownloadRequest,
    ContributorOut,
    PlaybookCreate,
    PlaybookFacetsOut,
    PlaybookListOut,
    PlaybookOut,
    PlaybookRoleRef,
    PlaybookUpdate,
    PlaybookVersionOut,
)
from rate_limit import limiter
from roles.managers import _confirmed_download_count, confirm_download

router = APIRouter()

_SLUG_RE = re.compile(r"^[a-z0-9][-a-z0-9]*$")
_SLUG_MAX_LEN = 200


def _validated_slug(slug: str = Path(...)) -> str:
    if len(slug) > _SLUG_MAX_LEN or not _SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Invalid slug format")
    return slug


def _build_role_refs(version) -> list[PlaybookRoleRef]:
    """Build PlaybookRoleRef list from the join table entries."""
    refs: list[PlaybookRoleRef] = []
    for entry in version.role_entries:
        role: RegistryRole = entry.role
        latest_rv = role.versions[0] if role.versions else None
        refs.append(PlaybookRoleRef(
            registry_role_id=entry.role_id,
            vars=entry.vars or {},
            role_slug=role.slug,
            role_name=latest_rv.name if latest_rv else role.slug,
        ))
    return refs


def _build_contributors(version, playbook_owner) -> list[ContributorOut]:
    """Compute contributors from role owners + playbook publisher."""
    seen: set[str] = set()
    contributors: list[ContributorOut] = []

    contributors.append(ContributorOut(
        username=playbook_owner.username,
        avatar_url=playbook_owner.avatar_url,
    ))
    seen.add(playbook_owner.username)

    for entry in version.role_entries:
        role: RegistryRole = entry.role
        if hasattr(role, "owner") and role.owner and role.owner.username not in seen:
            contributors.append(ContributorOut(
                username=role.owner.username,
                avatar_url=role.owner.avatar_url,
            ))
            seen.add(role.owner.username)

    return contributors


def _version_to_out(v, playbook_owner, *, download_event_id: StdUUID | str | None = None) -> PlaybookVersionOut:
    eid = StdUUID(str(download_event_id)) if download_event_id is not None else None
    return PlaybookVersionOut(
        id=v.id,
        playbook_id=v.playbook_id,
        version_number=v.version_number,
        name=v.name,
        description=v.description,
        become=v.become,
        roles=_build_role_refs(v),
        tags=v.tags,
        contributors=_build_contributors(v, playbook_owner),
        created_at=v.created_at,
        download_event_id=eid,
    )


async def _playbook_to_out(playbook, session: AsyncSession) -> PlaybookOut:
    latest = playbook.versions[0] if playbook.versions else None
    dl_count = await _confirmed_download_count(session, playbook_id=playbook.id)
    return PlaybookOut(
        id=playbook.id,
        slug=playbook.slug,
        owner=playbook.owner,
        download_count=dl_count,
        created_at=playbook.created_at,
        updated_at=playbook.updated_at,
        latest_version=_version_to_out(latest, playbook.owner) if latest else None,
    )


@router.get("/playbooks/facets", response_model=PlaybookFacetsOut)
async def get_facets(
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await managers.get_facets(session)


@router.get("/playbooks", response_model=PlaybookListOut)
async def list_playbooks(
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
    playbooks, total = await managers.list_playbooks(
        session,
        q=q,
        tags=tag_list,
        owner=owner,
        sort=sort,
        page=page,
        per_page=per_page,
    )
    return PlaybookListOut(
        items=[await _playbook_to_out(p, session) for p in playbooks],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/playbooks/{slug}", response_model=PlaybookOut)
async def get_playbook(
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    playbook = await managers.get_playbook(session, slug)
    return await _playbook_to_out(playbook, session)


@router.get("/playbooks/{slug}/versions", response_model=list[PlaybookVersionOut])
async def list_versions(
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    playbook = await managers.get_playbook(session, slug)
    return [_version_to_out(v, playbook.owner) for v in playbook.versions]


@router.post("/playbooks", response_model=PlaybookOut, status_code=201)
@limiter.limit("10/minute")
async def create_playbook(
    request: Request,
    data: PlaybookCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playbook = await managers.create_playbook(session, data, user)
    return await _playbook_to_out(playbook, session)


@router.put("/playbooks/{slug}", response_model=PlaybookOut)
@limiter.limit("20/minute")
async def update_playbook(
    request: Request,
    data: PlaybookUpdate,
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playbook = await managers.update_playbook(session, slug, data, user)
    return await _playbook_to_out(playbook, session)


@router.delete("/playbooks/{slug}", status_code=204)
@limiter.limit("10/minute")
async def delete_playbook(
    request: Request,
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await managers.delete_playbook(session, slug, user)


@router.post("/playbooks/{slug}/download", response_model=PlaybookVersionOut)
async def download_playbook(
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    version, event = await managers.download_playbook(session, slug)
    playbook = await managers.get_playbook(session, slug)
    return _version_to_out(version, playbook.owner, download_event_id=event.id)


@router.post("/playbooks/{slug}/confirm-download", status_code=204)
async def confirm_playbook_download(
    data: ConfirmDownloadRequest,
    slug: str = Depends(_validated_slug),
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await confirm_download(session, data.download_event_id)
