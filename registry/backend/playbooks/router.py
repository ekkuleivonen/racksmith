from uuid import UUID as StdUUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from db.engine import get_db
from db.models import RegistryRole, User
from playbooks import managers
from playbooks.schemas import (
    ConfirmDownloadRequest,
    ContributorResponse,
    PlaybookCreate,
    PlaybookFacetsResponse,
    PlaybookListResponse,
    PlaybookResponse,
    PlaybookRoleRef,
    PlaybookUpdate,
    PlaybookVersionResponse,
)
from rate_limit import limiter
from roles.managers import _confirmed_download_count, confirm_download

router = APIRouter()


def _build_role_refs(version) -> list[PlaybookRoleRef]:
    """Build PlaybookRoleRef list from the join table entries."""
    refs: list[PlaybookRoleRef] = []
    for entry in version.role_entries:
        role: RegistryRole = entry.role
        latest_rv = role.versions[0] if role.versions else None
        refs.append(PlaybookRoleRef(
            registry_role_id=entry.role_id,
            vars=entry.vars or {},
            role_name=latest_rv.name if latest_rv else str(entry.role_id),
        ))
    return refs


def _build_contributors(version, playbook_owner) -> list[ContributorResponse]:
    """Compute contributors from role owners + playbook publisher."""
    seen: set[str] = set()
    contributors: list[ContributorResponse] = []

    contributors.append(ContributorResponse(
        username=playbook_owner.username,
        avatar_url=playbook_owner.avatar_url,
    ))
    seen.add(playbook_owner.username)

    for entry in version.role_entries:
        role: RegistryRole = entry.role
        if hasattr(role, "owner") and role.owner and role.owner.username not in seen:
            contributors.append(ContributorResponse(
                username=role.owner.username,
                avatar_url=role.owner.avatar_url,
            ))
            seen.add(role.owner.username)

    return contributors


def _version_to_out(v, playbook_owner, *, download_event_id: StdUUID | str | None = None) -> PlaybookVersionResponse:
    eid = StdUUID(str(download_event_id)) if download_event_id is not None else None
    return PlaybookVersionResponse(
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


async def _playbook_to_out(playbook, session: AsyncSession) -> PlaybookResponse:
    latest = playbook.versions[0] if playbook.versions else None
    dl_count = await _confirmed_download_count(session, playbook_id=playbook.id)
    return PlaybookResponse(
        id=playbook.id,
        owner=playbook.owner,
        download_count=dl_count,
        created_at=playbook.created_at,
        updated_at=playbook.updated_at,
        latest_version=_version_to_out(latest, playbook.owner) if latest else None,
    )


@router.get("/playbooks/facets", response_model=PlaybookFacetsResponse)
async def get_facets(
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await managers.get_facets(session)


@router.get("/playbooks", response_model=PlaybookListResponse)
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
    return PlaybookListResponse(
        items=[await _playbook_to_out(p, session) for p in playbooks],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/playbooks/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    playbook = await managers.get_playbook(session, playbook_id)
    return await _playbook_to_out(playbook, session)


@router.get("/playbooks/{playbook_id}/versions", response_model=list[PlaybookVersionResponse])
async def list_versions(
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    playbook = await managers.get_playbook(session, playbook_id)
    return [_version_to_out(v, playbook.owner) for v in playbook.versions]


@router.post("/playbooks", response_model=PlaybookResponse, status_code=201)
@limiter.limit("10/minute")
async def create_playbook(
    request: Request,
    data: PlaybookCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playbook = await managers.create_playbook(session, data, user)
    return await _playbook_to_out(playbook, session)


@router.put("/playbooks/{playbook_id}", response_model=PlaybookResponse)
@limiter.limit("20/minute")
async def update_playbook(
    request: Request,
    data: PlaybookUpdate,
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playbook = await managers.update_playbook(session, playbook_id, data, user)
    return await _playbook_to_out(playbook, session)


@router.delete("/playbooks/{playbook_id}", status_code=204)
@limiter.limit("10/minute")
async def delete_playbook(
    request: Request,
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await managers.delete_playbook(session, playbook_id, user)


@router.post("/playbooks/{playbook_id}/download", response_model=PlaybookVersionResponse)
async def download_playbook(
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    version, event = await managers.download_playbook(session, playbook_id)
    playbook = await managers.get_playbook(session, playbook_id)
    return _version_to_out(version, playbook.owner, download_event_id=event.id)


@router.post("/playbooks/{playbook_id}/confirm-download", status_code=204)
async def confirm_playbook_download(
    data: ConfirmDownloadRequest,
    playbook_id: StdUUID,
    session: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await confirm_download(session, data.download_event_id)
