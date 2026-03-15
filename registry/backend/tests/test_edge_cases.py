"""Edge-case tests for registry playbook/role lifecycle.

These tests verify that the normalized schema with FK RESTRICT and
download_events correctly handles the edge cases previously identified.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from fastapi import HTTPException

from playbooks import managers as pb_managers
from playbooks.schemas import PlaybookCreate, PlaybookRoleRef, PlaybookUpdate
from roles import managers as role_managers
from roles.schemas import RoleCreate
from tests.conftest import SeedData


def _role_create(name: str = "Test Role") -> RoleCreate:
    return RoleCreate(
        name=name,
        description="A test role",
        platforms=[],
        tags=["test"],
        inputs=[],
        tasks_yaml="- name: noop\n  debug:\n    msg: ok\n",
        defaults_yaml="",
        meta_yaml="",
    )


def _playbook_create(role_ids: list[str], name: str = "Test Playbook") -> PlaybookCreate:
    return PlaybookCreate(
        name=name,
        description="A test playbook",
        become=False,
        roles=[PlaybookRoleRef(registry_role_id=UUID(rid), vars={}) for rid in role_ids],
        tags=["test"],
    )


# ===========================================================================
# Group G — Role deletion is blocked by FK RESTRICT
# ===========================================================================


class TestRoleDeletionBlocked:

    async def test_delete_role_referenced_by_playbook_returns_409(self, db, seed: SeedData):
        """RESTRICT FK prevents deleting a role that is referenced by playbooks."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        role_id = str(role.id)

        await pb_managers.create_playbook(
            db, _playbook_create([role_id]), seed.user,
        )

        with pytest.raises(HTTPException) as exc_info:
            await role_managers.delete_role(db, role.slug, seed.user)
        assert exc_info.value.status_code == 409
        assert "referenced by playbooks" in exc_info.value.detail

    async def test_role_deletion_blocked_preserves_playbook_visibility(self, db, seed: SeedData):
        """Since deletion is blocked, playbooks remain visible and functional."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        role_id = str(role.id)

        await pb_managers.create_playbook(
            db, _playbook_create([role_id]), seed.user,
        )

        with pytest.raises(HTTPException):
            await role_managers.delete_role(db, role.slug, seed.user)

        playbooks, total = await pb_managers.list_playbooks(db)
        assert total == 1

    async def test_playbook_update_works_after_failed_role_delete(self, db, seed: SeedData):
        """Since role deletion is blocked, the playbook remains fully updatable."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        role_id = str(role.id)

        playbook = await pb_managers.create_playbook(
            db, _playbook_create([role_id]), seed.user,
        )

        with pytest.raises(HTTPException):
            await role_managers.delete_role(db, role.slug, seed.user)

        update = PlaybookUpdate(name="Renamed Playbook")
        # The key assertion: update_playbook completes without raising
        await pb_managers.update_playbook(db, playbook.slug, update, seed.user)

    async def test_unreferenced_role_can_be_deleted(self, db, seed: SeedData):
        """A role not referenced by any playbook can be freely deleted."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        await role_managers.delete_role(db, role.slug, seed.user)

        with pytest.raises(HTTPException) as exc_info:
            await role_managers.get_role(db, role.slug)
        assert exc_info.value.status_code == 404


# ===========================================================================
# Group H — Delete and re-create is blocked when referenced
# ===========================================================================


class TestDeleteAndRecreateRole:

    async def test_cannot_delete_referenced_role_for_recreate(self, db, seed: SeedData):
        """The delete-and-recreate scenario is impossible because the first
        step (delete) is blocked by the FK RESTRICT constraint.
        """
        role = await role_managers.create_role(db, _role_create("Nginx"), seed.user)
        role_id = str(role.id)

        await pb_managers.create_playbook(
            db, _playbook_create([role_id], name="Deploy Web"), seed.user,
        )

        with pytest.raises(HTTPException) as exc_info:
            await role_managers.delete_role(db, role.slug, seed.user)
        assert exc_info.value.status_code == 409

    async def test_unreferenced_role_recreate_gets_new_uuid(self, db, seed: SeedData):
        """Deleting an unreferenced role and recreating produces a new UUID."""
        role_v1 = await role_managers.create_role(db, _role_create("Nginx"), seed.user)
        old_uuid = str(role_v1.id)

        await role_managers.delete_role(db, role_v1.slug, seed.user)

        role_v2 = await role_managers.create_role(db, _role_create("Nginx"), seed.user)
        assert str(role_v2.id) != old_uuid


# ===========================================================================
# Group I — Download count uses download_events with confirmation
# ===========================================================================


class TestDownloadCountAccuracy:

    async def test_download_role_creates_unconfirmed_event(self, db, seed: SeedData):
        """download_role creates a DownloadEvent with confirmed=false.
        The confirmed count should be 0 until the client confirms.
        """
        role = await role_managers.create_role(db, _role_create(), seed.user)

        version, event = await role_managers.download_role(db, role.slug)
        assert event.confirmed is False

        count = await role_managers._confirmed_download_count(db, role_id=role.id)
        assert count == 0

    async def test_confirmed_download_increments_count(self, db, seed: SeedData):
        """After confirming, the download count goes up."""
        role = await role_managers.create_role(db, _role_create(), seed.user)

        _version, event = await role_managers.download_role(db, role.slug)
        await role_managers.confirm_download(db, event.id)

        count = await role_managers._confirmed_download_count(db, role_id=role.id)
        assert count == 1

    async def test_download_playbook_creates_unconfirmed_event(self, db, seed: SeedData):
        """Same confirmation pattern for playbooks."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        playbook = await pb_managers.create_playbook(
            db, _playbook_create([str(role.id)]), seed.user,
        )

        _version, event = await pb_managers.download_playbook(db, playbook.slug)
        assert event.confirmed is False

        count = await role_managers._confirmed_download_count(db, playbook_id=playbook.id)
        assert count == 0


# ===========================================================================
# Group J — Role refs derived from join table at read time
# ===========================================================================


class TestRoleRefsSerialization:

    async def test_playbook_version_has_role_entries(self, db, seed: SeedData):
        """PlaybookVersion.role_entries contains the referenced roles."""
        role = await role_managers.create_role(db, _role_create(), seed.user)
        role_id = str(role.id)

        playbook = await pb_managers.create_playbook(
            db, _playbook_create([role_id]), seed.user,
        )

        reloaded = await pb_managers.get_playbook(db, playbook.slug)
        latest = reloaded.versions[0]
        assert len(latest.role_entries) == 1
        assert str(latest.role_entries[0].role_id) == role_id

    async def test_playbook_role_position_preserved(self, db, seed: SeedData):
        """Position ordering is preserved across roles."""
        role_a = await role_managers.create_role(db, _role_create("Role A"), seed.user)
        role_b = await role_managers.create_role(db, _role_create("Role B"), seed.user)

        playbook = await pb_managers.create_playbook(
            db,
            _playbook_create([str(role_a.id), str(role_b.id)]),
            seed.user,
        )

        reloaded = await pb_managers.get_playbook(db, playbook.slug)
        latest = reloaded.versions[0]
        assert len(latest.role_entries) == 2
        assert str(latest.role_entries[0].role_id) == str(role_a.id)
        assert str(latest.role_entries[1].role_id) == str(role_b.id)
        assert latest.role_entries[0].position == 0
        assert latest.role_entries[1].position == 1


# ===========================================================================
# Group K — Download returns event ID for client confirmation
# ===========================================================================


class TestDownloadReturnsEventId:

    async def test_download_role_returns_event(self, db, seed: SeedData):
        role = await role_managers.create_role(db, _role_create(), seed.user)
        version, event = await role_managers.download_role(db, role.slug)
        assert event.id is not None
        assert version.name == "Test Role"

    async def test_download_playbook_returns_event(self, db, seed: SeedData):
        role = await role_managers.create_role(db, _role_create(), seed.user)
        playbook = await pb_managers.create_playbook(
            db, _playbook_create([str(role.id)]), seed.user,
        )
        version, event = await pb_managers.download_playbook(db, playbook.slug)
        assert event.id is not None
        assert version.name == "Test Playbook"
