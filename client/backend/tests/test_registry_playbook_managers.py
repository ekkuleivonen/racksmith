"""Tests for registry playbook push/import/list/get flows."""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest
import respx
import yaml

from core.playbooks import PlaybookData, PlaybookRoleEntry, write_playbook
from core.racksmith_meta import (
    get_playbook_meta,
    get_role_meta,
    read_meta,
    set_playbook_meta,
    set_role_meta,
    write_meta,
)
from roles.registry import registry_manager

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REGISTRY_URL = "http://registry.test"
ROLE_UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ROLE_UUID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
PLAYBOOK_UUID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
VERSION_UUID = "dddddddd-dddd-dddd-dddd-dddddddddddd"

REGISTRY_PLAYBOOK_RESPONSE = {
    "id": PLAYBOOK_UUID,
    "owner": {"username": "alice", "avatar_url": "https://gh.com/alice.png"},
    "download_count": 0,
    "created_at": "2026-01-01T00:00:00",
    "updated_at": None,
    "latest_version": {
        "id": VERSION_UUID,
        "playbook_id": PLAYBOOK_UUID,
        "version_number": 1,
        "name": "My Playbook",
        "description": "A test playbook",
        "become": False,
        "roles": [
            {"registry_role_id": ROLE_UUID_A, "version_number": None, "vars": {"port": 80}},
        ],
        "tags": ["web"],
        "contributors": [
            {"username": "alice", "avatar_url": "https://gh.com/alice.png"},
        ],
        "created_at": "2026-01-01T00:00:00",
    },
}

PLAYBOOK_DOWNLOAD_RESPONSE = {
    "id": VERSION_UUID,
    "playbook_id": PLAYBOOK_UUID,
    "version_number": 1,
    "name": "My Playbook",
    "description": "A test playbook",
    "become": True,
    "roles": [
        {"registry_role_id": ROLE_UUID_A, "version_number": None, "vars": {"port": 80}},
        {"registry_role_id": ROLE_UUID_B, "version_number": None, "vars": {}},
    ],
    "tags": ["web"],
    "contributors": [
        {"username": "alice", "avatar_url": "https://gh.com/alice.png"},
        {"username": "bob", "avatar_url": "https://gh.com/bob.png"},
    ],
    "created_at": "2026-01-01T00:00:00",
}

ROLE_LIST_RESPONSE = {
    "items": [
        {
            "id": ROLE_UUID_A,
            "owner": {"username": "alice", "avatar_url": ""},
            "download_count": 0,
            "created_at": "2026-01-01",
            "updated_at": None,
            "latest_version": None,
        },
        {
            "id": ROLE_UUID_B,
            "owner": {"username": "bob", "avatar_url": ""},
            "download_count": 0,
            "created_at": "2026-01-01",
            "updated_at": None,
            "latest_version": None,
        },
    ],
    "total": 2,
    "page": 1,
    "per_page": 100,
}

ROLE_DOWNLOAD_RESPONSE = {
    "id": "v1",
    "role_id": ROLE_UUID_B,
    "version_number": 1,
    "name": "Role B",
    "description": "Auto-imported role",
    "platforms": [],
    "tags": [],
    "inputs": [],
    "tasks_yaml": "- name: noop\n  debug:\n    msg: ok\n",
    "defaults_yaml": "",
    "meta_yaml": "",
    "created_at": "2026-01-01",
}


def _seed_role(layout, role_id: str) -> None:
    """Create a minimal local role directory."""
    role_dir = layout.roles_path / role_id
    (role_dir / "meta").mkdir(parents=True, exist_ok=True)
    (role_dir / "tasks").mkdir(parents=True, exist_ok=True)
    (role_dir / "meta" / "main.yml").write_text(
        f"galaxy_info:\n  role_name: {role_id}\n  description: Test\n"
    )
    (role_dir / "tasks" / "main.yml").write_text("- name: noop\n  debug:\n    msg: ok\n")


def _seed_playbook(layout, playbook_id: str, roles: list[PlaybookRoleEntry] | None = None) -> None:
    write_playbook(layout, PlaybookData(
        id=playbook_id,
        path=layout.playbooks_path / f"{playbook_id}.yml",
        name=f"Playbook {playbook_id}",
        description="Test playbook",
        become=False,
        roles=roles or [],
    ))


def _mark_role_as_published(layout, role_id: str, registry_id: str) -> None:
    """Write registry_id into .racksmith.yml for a role."""
    meta = read_meta(layout)
    rmeta = get_role_meta(meta, role_id)
    rmeta["registry_id"] = registry_id
    set_role_meta(meta, role_id, rmeta)
    write_meta(layout, meta)


def _mark_playbook_as_published(layout, playbook_id: str, registry_id: str) -> None:
    """Write registry_id into .racksmith.yml for a playbook."""
    meta = read_meta(layout)
    pmeta = get_playbook_meta(meta, playbook_id)
    pmeta["registry_id"] = registry_id
    set_playbook_meta(meta, playbook_id, pmeta)
    write_meta(layout, meta)


def _settings_and_repo_patches(repo_path):
    """Return a combined context manager that patches settings + repos_manager + cache + git."""
    from contextlib import contextmanager
    from unittest.mock import AsyncMock

    @contextmanager
    def ctx():
        with (
            patch("roles.registry.settings") as s,
            patch("roles.registry.repos_manager") as rm,
            patch("roles.registry._cache_get", return_value=None),
            patch("roles.registry._cache_set"),
            patch("roles.registry._cache_invalidate"),
            patch("roles.registry.arun_git", new_callable=AsyncMock),
        ):
            s.REGISTRY_URL = REGISTRY_URL
            s.RACKSMITH_VERSION = "1.0.0"
            s.GIT_COMMIT_USER_NAME = "test"
            s.GIT_COMMIT_USER_EMAIL = "test@test.com"
            s.GIT_RACKSMITH_BRANCH = "main"
            s.REDIS_REGISTRY_CACHE_PREFIX = "test:"
            s.REGISTRY_CACHE_TTL = 60
            rm.active_repo_path.return_value = repo_path
            rm.current_repo.return_value = None
            yield s
    return ctx


# ---------------------------------------------------------------------------
# push_playbook tests
# ---------------------------------------------------------------------------


class TestPushPlaybook:
    """Test the registry_id resolution logic when pushing a playbook."""

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_resolves_role_registry_ids(self, mock_session, layout, repo_path):
        """Happy path: roles have registry_ids (UUIDs), push sends correct UUIDs."""
        _seed_role(layout, "my_role")
        _mark_role_as_published(layout, "my_role", ROLE_UUID_A)
        _seed_playbook(layout, "test_pb", roles=[
            PlaybookRoleEntry(role="my_role", vars={"port": 80}),
        ])

        upsert_route = respx.put(f"{REGISTRY_URL}/playbooks").mock(
            return_value=httpx.Response(201, json=REGISTRY_PLAYBOOK_RESPONSE)
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.push_playbook(mock_session, "test_pb")

        assert result.id == PLAYBOOK_UUID
        assert upsert_route.called
        sent_body = upsert_route.calls[0].request.content
        import json
        body = json.loads(sent_body)
        assert body["roles"][0]["registry_role_id"] == ROLE_UUID_A
        assert body["roles"][0]["vars"] == {"port": 80}

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_auto_pushes_unpublished_role(self, mock_session, layout, repo_path):
        """If a role hasn't been pushed, push_playbook auto-pushes it first."""
        _seed_role(layout, "unpushed_role")
        _seed_playbook(layout, "test_pb", roles=[
            PlaybookRoleEntry(role="unpushed_role"),
        ])

        auto_push_role_uuid = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
        role_response = {
            "id": auto_push_role_uuid,
            "owner": {"username": "alice", "avatar_url": ""},
            "download_count": 0,
            "created_at": "2026-01-01",
            "updated_at": None,
            "latest_version": None,
        }

        role_upsert_route = respx.put(f"{REGISTRY_URL}/roles").mock(
            return_value=httpx.Response(201, json=role_response),
        )
        pb_upsert_route = respx.put(f"{REGISTRY_URL}/playbooks").mock(
            return_value=httpx.Response(201, json=REGISTRY_PLAYBOOK_RESPONSE),
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.push_playbook(mock_session, "test_pb")

        assert role_upsert_route.called
        assert pb_upsert_route.called
        assert result.id == PLAYBOOK_UUID

        import json
        pb_body = json.loads(pb_upsert_route.calls[0].request.content)
        assert pb_body["roles"][0]["registry_role_id"] == auto_push_role_uuid

    @pytest.mark.asyncio
    async def test_push_fails_when_playbook_not_found(self, mock_session, layout, repo_path):
        """Non-existent playbook raises FileNotFoundError."""
        with _settings_and_repo_patches(repo_path)():
            with pytest.raises(FileNotFoundError, match="not found"):
                await registry_manager.push_playbook(mock_session, "nonexistent")

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_updates_existing_playbook(self, mock_session, layout, repo_path):
        """Re-push uses the same upsert endpoint; registry handles create-or-update."""
        _seed_role(layout, "my_role")
        _mark_role_as_published(layout, "my_role", ROLE_UUID_A)
        _seed_playbook(layout, "test_pb", roles=[
            PlaybookRoleEntry(role="my_role"),
        ])
        _mark_playbook_as_published(layout, "test_pb", PLAYBOOK_UUID)

        upsert_route = respx.put(f"{REGISTRY_URL}/playbooks").mock(
            return_value=httpx.Response(200, json=REGISTRY_PLAYBOOK_RESPONSE)
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.push_playbook(mock_session, "test_pb")

        assert result.id == PLAYBOOK_UUID
        assert upsert_route.called


# ---------------------------------------------------------------------------
# import_playbook tests
# ---------------------------------------------------------------------------


class TestImportPlaybook:
    """Test the download, role resolution, and local write logic."""

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_with_all_roles_present(self, mock_session, layout, repo_path):
        """When all roles already exist locally, import writes playbook with local IDs."""
        _seed_role(layout, "local_role_a")
        _mark_role_as_published(layout, "local_role_a", ROLE_UUID_A)
        _seed_role(layout, "local_role_b")
        _mark_role_as_published(layout, "local_role_b", ROLE_UUID_B)

        respx.post(f"{REGISTRY_URL}/playbooks/{PLAYBOOK_UUID}/download").mock(
            return_value=httpx.Response(200, json=PLAYBOOK_DOWNLOAD_RESPONSE)
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.import_playbook(mock_session, PLAYBOOK_UUID)

        assert result.name == "My Playbook"
        assert result.message == "Playbook imported and pushed to GitHub"

        # Verify the playbook was written to disk
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        assert len(playbook_files) == 1
        content = yaml.safe_load(playbook_files[0].read_text())
        play = content[0]
        assert play["name"] == "My Playbook"
        assert play["become"] is True

        # Roles should reference local IDs, not registry UUIDs
        role_ids = []
        for r in play["roles"]:
            if isinstance(r, str):
                role_ids.append(r)
            elif isinstance(r, dict):
                role_ids.append(r.get("role", ""))
        assert "local_role_a" in role_ids
        assert "local_role_b" in role_ids

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_stores_registry_id_in_meta(self, mock_session, layout, repo_path):
        """Imported playbook should have registry_id (UUID) stored in .racksmith.yml."""
        _seed_role(layout, "local_role_a")
        _mark_role_as_published(layout, "local_role_a", ROLE_UUID_A)
        _seed_role(layout, "local_role_b")
        _mark_role_as_published(layout, "local_role_b", ROLE_UUID_B)

        respx.post(f"{REGISTRY_URL}/playbooks/{PLAYBOOK_UUID}/download").mock(
            return_value=httpx.Response(200, json=PLAYBOOK_DOWNLOAD_RESPONSE)
        )

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.import_playbook(mock_session, PLAYBOOK_UUID)

        meta = read_meta(layout)
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        pb_id = playbook_files[0].stem
        pb_meta = get_playbook_meta(meta, pb_id)
        assert pb_meta.get("registry_id") == PLAYBOOK_UUID

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_auto_imports_missing_role(self, mock_session, layout, repo_path):
        """When a referenced role isn't local, import_playbook auto-imports it."""
        # Only role A exists locally; role B needs to be auto-imported
        _seed_role(layout, "local_role_a")
        _mark_role_as_published(layout, "local_role_a", ROLE_UUID_A)

        respx.post(f"{REGISTRY_URL}/playbooks/{PLAYBOOK_UUID}/download").mock(
            return_value=httpx.Response(200, json=PLAYBOOK_DOWNLOAD_RESPONSE)
        )
        # Auto-import flow: download role by UUID directly
        respx.post(f"{REGISTRY_URL}/roles/{ROLE_UUID_B}/download").mock(
            return_value=httpx.Response(200, json=ROLE_DOWNLOAD_RESPONSE)
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.import_playbook(mock_session, PLAYBOOK_UUID)

        assert result.name == "My Playbook"

        # Verify role B was auto-imported (should now exist in roles_path)
        role_dirs = [d.name for d in layout.roles_path.iterdir() if d.is_dir()]
        assert "local_role_a" in role_dirs
        # The auto-imported role gets a generated ID
        auto_imported = [d for d in role_dirs if d != "local_role_a"]
        assert len(auto_imported) == 1

        # And the playbook's YAML should use local IDs for both roles
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        content = yaml.safe_load(playbook_files[0].read_text())
        play_roles = content[0]["roles"]
        role_names = []
        for r in play_roles:
            if isinstance(r, str):
                role_names.append(r)
            elif isinstance(r, dict):
                role_names.append(r.get("role", ""))
        # Both should be local IDs, not UUIDs
        for name in role_names:
            assert "-" * 4 not in name, f"Role ID looks like a UUID: {name}"


# ---------------------------------------------------------------------------
# list_playbooks / get_playbook proxy tests
# ---------------------------------------------------------------------------


class TestListAndGetPlaybooks:

    @respx.mock
    @pytest.mark.asyncio
    async def test_list_playbooks(self, mock_session):
        with patch("roles.registry.settings") as s:
            s.REGISTRY_URL = REGISTRY_URL
            s.REDIS_REGISTRY_CACHE_PREFIX = "test:"
            s.REGISTRY_CACHE_TTL = 60
            with (
                patch("roles.registry._cache_get", return_value=None),
                patch("roles.registry._cache_set"),
            ):
                respx.get(f"{REGISTRY_URL}/playbooks").mock(
                    return_value=httpx.Response(200, json={
                        "items": [REGISTRY_PLAYBOOK_RESPONSE],
                        "total": 1,
                        "page": 1,
                        "per_page": 20,
                    })
                )
                result = await registry_manager.list_playbooks(mock_session)
        assert len(result.items) == 1
        assert result.items[0].id == PLAYBOOK_UUID

    @respx.mock
    @pytest.mark.asyncio
    async def test_get_playbook(self, mock_session):
        with patch("roles.registry.settings") as s:
            s.REGISTRY_URL = REGISTRY_URL
            s.REDIS_REGISTRY_CACHE_PREFIX = "test:"
            s.REGISTRY_CACHE_TTL = 60
            with (
                patch("roles.registry._cache_get", return_value=None),
                patch("roles.registry._cache_set"),
            ):
                respx.get(f"{REGISTRY_URL}/playbooks/{PLAYBOOK_UUID}").mock(
                    return_value=httpx.Response(200, json=REGISTRY_PLAYBOOK_RESPONSE)
                )
                result = await registry_manager.get_playbook(mock_session, PLAYBOOK_UUID)
        assert result.id == PLAYBOOK_UUID
        assert result.latest_version is not None
        assert result.latest_version.name == "My Playbook"
        assert len(result.latest_version.contributors) == 1
        assert result.latest_version.contributors[0].username == "alice"
