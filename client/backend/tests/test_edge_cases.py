"""Edge-case tests for playbook/role lifecycle on the client side.

These tests verify that the client-side fixes work correctly:
- push_role/push_playbook store slug as registry_id (not UUID)
- import_playbook uses /roles/by-id/ endpoint (not paginated list)
- import_playbook fails fast when a role is missing
- remove_role blocks deletion when playbooks reference the role
- confirm-download is called after successful import
- atomic writes survive mid-write crashes
- path-traversal IDs are rejected
- push GET errors are not swallowed
- import_playbook preserves description in metadata
- git add scopes are correct
- symlink role dirs are safely removed
- import_ansible skips collisions
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx
import yaml

from core import atomic_yaml_dump, validate_safe_id
from core.playbooks import (
    PlaybookData,
    PlaybookRoleEntry,
    write_playbook,
)
from core.racksmith_meta import (
    RacksmithMeta,
    get_playbook_meta,
    get_role_meta,
    read_meta,
    set_playbook_meta,
    set_role_meta,
    write_meta,
)
from core.roles import RoleData, remove_role, write_role
from repo.import_ansible import import_ansible
from roles.registry import registry_manager

REGISTRY_URL = "http://registry.test"
ROLE_UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ROLE_UUID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
PLAYBOOK_UUID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
VERSION_UUID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
DOWNLOAD_EVENT_UUID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"


def _seed_role(layout, role_id: str) -> None:
    """Create a minimal local role directory."""
    role_dir = layout.roles_path / role_id
    (role_dir / "meta").mkdir(parents=True, exist_ok=True)
    (role_dir / "tasks").mkdir(parents=True, exist_ok=True)
    (role_dir / "meta" / "main.yml").write_text(
        f"galaxy_info:\n  role_name: {role_id}\n  description: Test\n"
    )
    (role_dir / "tasks" / "main.yml").write_text(
        "- name: noop\n  debug:\n    msg: ok\n"
    )


def _seed_playbook(
    layout, playbook_id: str, roles: list[PlaybookRoleEntry] | None = None,
) -> None:
    write_playbook(
        layout,
        PlaybookData(
            id=playbook_id,
            path=layout.playbooks_path / f"{playbook_id}.yml",
            name=f"Playbook {playbook_id}",
            description="Test playbook",
            become=False,
            roles=roles or [],
        ),
    )


def _mark_role_as_published(layout, role_id: str, *, slug: str, uuid: str) -> None:
    meta = read_meta(layout)
    rmeta = get_role_meta(meta, role_id)
    rmeta["registry_id"] = slug
    rmeta["registry_uuid"] = uuid
    set_role_meta(meta, role_id, rmeta)
    write_meta(layout, meta)


def _mark_playbook_as_published(layout, playbook_id: str, *, slug: str, uuid: str) -> None:
    meta = read_meta(layout)
    pmeta = get_playbook_meta(meta, playbook_id)
    pmeta["registry_id"] = slug
    pmeta["registry_uuid"] = uuid
    set_playbook_meta(meta, playbook_id, pmeta)
    write_meta(layout, meta)


def _settings_and_repo_patches(repo_path):
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


def _role_response(*, id: str = ROLE_UUID_A, slug: str = "my-role") -> dict:
    return {
        "id": id,
        "slug": slug,
        "owner": {"username": "user", "avatar_url": ""},
        "download_count": 0,
        "created_at": "2024-01-01",
        "updated_at": None,
        "latest_version": None,
    }


def _role_download_response(
    *, role_id: str = ROLE_UUID_A, name: str = "My Role",
    download_event_id: str = DOWNLOAD_EVENT_UUID,
) -> dict:
    return {
        "id": VERSION_UUID,
        "role_id": role_id,
        "version_number": 1,
        "name": name,
        "description": "A test role",
        "platforms": [],
        "tags": [],
        "inputs": [],
        "tasks_yaml": "- name: noop\n  debug:\n    msg: ok\n",
        "defaults_yaml": "",
        "meta_yaml": "",
        "created_at": "2024-01-01",
        "download_event_id": download_event_id,
    }


def _playbook_response() -> dict:
    return {
        "id": PLAYBOOK_UUID,
        "slug": "my-playbook",
        "owner": {"username": "alice", "avatar_url": ""},
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
                {
                    "registry_role_id": ROLE_UUID_A,
                    "version_number": None,
                    "vars": {"port": 80},
                },
            ],
            "tags": ["web"],
            "contributors": [{"username": "alice", "avatar_url": ""}],
            "created_at": "2026-01-01T00:00:00",
        },
    }


def _playbook_download_response(
    *, download_event_id: str = DOWNLOAD_EVENT_UUID,
) -> dict:
    return {
        "id": VERSION_UUID,
        "playbook_id": PLAYBOOK_UUID,
        "version_number": 1,
        "name": "My Playbook",
        "description": "A test playbook",
        "become": False,
        "roles": [
            {
                "registry_role_id": ROLE_UUID_A,
                "version_number": None,
                "vars": {"port": 80},
            },
        ],
        "tags": ["web"],
        "contributors": [{"username": "alice", "avatar_url": ""}],
        "created_at": "2026-01-01T00:00:00",
        "download_event_id": download_event_id,
    }


# ===========================================================================
# Group A — Re-push stores slug (not UUID) as registry_id
# ===========================================================================


class TestRepushFixed:
    """push_role/push_playbook use a single upsert endpoint (PUT /roles, PUT /playbooks).
    Registry handles create-or-update. Client stores slug as registry_id.
    """

    @respx.mock
    @pytest.mark.asyncio
    async def test_repush_role_after_first_push(self, mock_session, layout, repo_path):
        _seed_role(layout, "my_role")

        role_resp = _role_response(id=ROLE_UUID_A, slug="my-role")

        upsert_route = respx.put(f"{REGISTRY_URL}/roles").mock(
            return_value=httpx.Response(200, json=role_resp),
        )

        with _settings_and_repo_patches(repo_path)():
            first = await registry_manager.push_role(mock_session, "my_role")
            assert first.slug == "my-role"

            meta = read_meta(layout)
            rmeta = get_role_meta(meta, "my_role")
            assert rmeta["registry_id"] == "my-role"
            assert rmeta["registry_uuid"] == ROLE_UUID_A

            second = await registry_manager.push_role(mock_session, "my_role")
            assert second.slug == "my-role"

        assert upsert_route.call_count == 2

    @respx.mock
    @pytest.mark.asyncio
    async def test_repush_playbook_after_first_push(self, mock_session, layout, repo_path):
        _seed_role(layout, "my_role")
        _mark_role_as_published(layout, "my_role", slug="my-role", uuid=ROLE_UUID_A)
        _seed_playbook(
            layout,
            "test_pb",
            roles=[PlaybookRoleEntry(role="my_role", vars={"port": 80})],
        )

        pb_resp = _playbook_response()

        upsert_route = respx.put(f"{REGISTRY_URL}/playbooks").mock(
            return_value=httpx.Response(200, json=pb_resp),
        )

        with _settings_and_repo_patches(repo_path)():
            first = await registry_manager.push_playbook(mock_session, "test_pb")
            assert first.slug == "my-playbook"

            meta = read_meta(layout)
            pmeta = get_playbook_meta(meta, "test_pb")
            assert pmeta["registry_id"] == "my-playbook"
            assert pmeta["registry_uuid"] == PLAYBOOK_UUID

            second = await registry_manager.push_playbook(mock_session, "test_pb")
            assert second.slug == "my-playbook"

        assert upsert_route.call_count == 2


# ===========================================================================
# Group B — Auto-import uses /roles/by-id/ and fails fast
# ===========================================================================


class TestAutoImportFixed:

    @respx.mock
    @pytest.mark.asyncio
    async def test_auto_import_uses_by_id_endpoint(
        self, mock_session, layout, repo_path,
    ):
        """Playbook import uses /roles/by-id/{uuid} instead of paginated list."""
        download_resp = _playbook_download_response()
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )

        # The by-id endpoint returns the role
        respx.get(f"{REGISTRY_URL}/roles/by-id/{ROLE_UUID_A}").mock(
            return_value=httpx.Response(200, json=_role_response()),
        )

        # Role download for auto-import
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=_role_download_response()),
        )

        # Confirm download endpoints
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.import_playbook(mock_session, "test-pb")

        assert result.name == "My Playbook"

        # Playbook was written with proper local role IDs (not UUIDs)
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        content = yaml.safe_load(playbook_files[0].read_text())
        play_roles = content[0]["roles"]
        for r in play_roles:
            role_name = r.get("role", r) if isinstance(r, dict) else r
            assert ROLE_UUID_A not in str(role_name)

    @respx.mock
    @pytest.mark.asyncio
    async def test_auto_import_fails_fast_on_missing_role(
        self, mock_session, layout, repo_path,
    ):
        """When a role referenced by a playbook no longer exists in the
        registry, import_playbook raises an error instead of writing
        UUIDs as role names.
        """
        download_resp = _playbook_download_response()
        download_resp["roles"] = [
            {"registry_role_id": ROLE_UUID_B, "version_number": None, "vars": {}},
        ]
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )

        # Role lookup returns 404 — role no longer exists
        respx.get(f"{REGISTRY_URL}/roles/by-id/{ROLE_UUID_B}").mock(
            return_value=httpx.Response(404, json={"detail": "Role not found"}),
        )

        with _settings_and_repo_patches(repo_path)():
            with pytest.raises(httpx.HTTPStatusError):
                await registry_manager.import_playbook(mock_session, "test-pb")

        # No playbook file should have been written
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        assert len(playbook_files) == 0


# ===========================================================================
# Group C — Local role deletion blocks when playbooks reference it
# ===========================================================================


class TestLocalRoleDeletionBlocked:

    def test_delete_local_role_used_by_playbook_raises(self, layout):
        """remove_role raises ValueError when playbooks reference the role."""
        _seed_role(layout, "my_role")
        _seed_playbook(
            layout,
            "test_pb",
            roles=[PlaybookRoleEntry(role="my_role", vars={})],
        )

        with pytest.raises(ValueError, match="used by playbooks"):
            remove_role(layout, "my_role")

        # Role directory should still exist
        assert (layout.roles_path / "my_role").exists()

    def test_delete_unreferenced_role_succeeds(self, layout):
        """Roles not used by any playbook can be freely deleted."""
        _seed_role(layout, "unused_role")

        remove_role(layout, "unused_role")
        assert not (layout.roles_path / "unused_role").exists()


# ===========================================================================
# Group D — Push playbook uses registry_uuid for role refs
# ===========================================================================


class TestPushPlaybookUsesRegistryUuid:

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_playbook_sends_uuid_not_slug_for_role_refs(
        self, mock_session, layout, repo_path,
    ):
        """push_playbook reads registry_uuid (not registry_id/slug) to build
        the PlaybookRoleRef.registry_role_id sent to the registry.
        """
        _seed_role(layout, "my_role")
        _mark_role_as_published(layout, "my_role", slug="my-role", uuid=ROLE_UUID_A)
        _seed_playbook(
            layout,
            "test_pb",
            roles=[PlaybookRoleEntry(role="my_role", vars={})],
        )

        captured_body = {}

        def _capture_upsert(request):
            import json
            captured_body.update(json.loads(request.content))
            return httpx.Response(201, json=_playbook_response())

        respx.put(f"{REGISTRY_URL}/playbooks").mock(side_effect=_capture_upsert)

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.push_playbook(mock_session, "test_pb")

        # The role ref in the request body should use the UUID, not the slug
        role_refs = captured_body.get("roles", [])
        assert len(role_refs) == 1
        assert role_refs[0]["registry_role_id"] == ROLE_UUID_A


# ===========================================================================
# Group E — Download count only incremented on confirmed import
# ===========================================================================


class TestDownloadCountOnFailedImport:

    @respx.mock
    @pytest.mark.asyncio
    async def test_failed_import_does_not_confirm_download(
        self, mock_session, layout, repo_path,
    ):
        """When local write fails, the confirm-download endpoint is never
        called, so the download event stays unconfirmed and doesn't
        count toward the download total.
        """
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(
                200, json=_role_download_response(role_id=ROLE_UUID_A),
            ),
        )

        confirm_route = respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            with patch("roles.registry.write_role", side_effect=OSError("disk full")):
                with pytest.raises(OSError, match="disk full"):
                    await registry_manager.import_role(mock_session, "my-role")

        # Confirm-download should NOT have been called
        assert not confirm_route.called

    @respx.mock
    @pytest.mark.asyncio
    async def test_successful_import_confirms_download(
        self, mock_session, layout, repo_path,
    ):
        """When import succeeds, the confirm endpoint is called."""
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(
                200, json=_role_download_response(role_id=ROLE_UUID_A),
            ),
        )

        confirm_route = respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.import_role(mock_session, "my-role")

        assert confirm_route.called


# ===========================================================================
# Group F — Import dedup uses registry_uuid
# ===========================================================================


class TestImportDedup:

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_role_dedup_uses_registry_uuid(
        self, mock_session, layout, repo_path,
    ):
        """Import detects already-imported roles via registry_uuid field."""
        _seed_role(layout, "existing_role")
        _mark_role_as_published(layout, "existing_role", slug="my-role", uuid=ROLE_UUID_A)

        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(
                200, json=_role_download_response(role_id=ROLE_UUID_A),
            ),
        )

        with _settings_and_repo_patches(repo_path)():
            result = await registry_manager.import_role(mock_session, "my-role")

        assert result.message == "Role already exists locally"


# ===========================================================================
# Group G — Atomic writes survive mid-write crashes
# ===========================================================================


class TestAtomicWrites:

    def test_atomic_yaml_dump_creates_file(self, tmp_path):
        path = tmp_path / "test.yml"
        atomic_yaml_dump({"key": "value"}, path)
        assert path.exists()
        content = yaml.safe_load(path.read_text())
        assert content == {"key": "value"}

    def test_atomic_yaml_dump_preserves_original_on_failure(self, tmp_path):
        """If the YAML dump raises, the original file is untouched."""
        path = tmp_path / "test.yml"
        path.write_text("original: data\n", encoding="utf-8")

        with patch("core.yaml_rt") as mock_rt:
            mock_rt.return_value.dump.side_effect = RuntimeError("bad data")
            with pytest.raises(RuntimeError, match="bad data"):
                atomic_yaml_dump({"broken": True}, path)

        assert path.read_text() == "original: data\n"

    def test_write_meta_atomic(self, layout):
        """write_meta uses atomic writes — original survives a dump failure."""
        meta = RacksmithMeta(schema_version=1)
        meta.roles["role_a"] = {"registry_id": "original"}
        write_meta(layout, meta)

        meta_path = layout.racksmith_base / ".racksmith.yml"
        original = meta_path.read_text()

        meta2 = RacksmithMeta(schema_version=1)
        meta2.roles["role_b"] = {"registry_id": "new"}
        with patch("core.racksmith_meta.atomic_yaml_dump", side_effect=OSError("disk full")):
            with pytest.raises(OSError):
                write_meta(layout, meta2)

        assert meta_path.read_text() == original

    def test_no_leftover_tmp_files(self, tmp_path):
        """After a successful write, no .tmp files linger."""
        path = tmp_path / "clean.yml"
        atomic_yaml_dump({"a": 1}, path)
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert tmp_files == []


# ===========================================================================
# Group H — Path-traversal IDs are rejected
# ===========================================================================


class TestPathSanitization:

    @pytest.mark.parametrize("bad_id", [
        "",
        "   ",
        "../escape",
        "../../etc/passwd",
        "foo/bar",
        "foo\\bar",
        "has\x00null",
        ".hidden",
        "-starts-with-dash",
    ])
    def test_validate_safe_id_rejects_bad_ids(self, bad_id):
        with pytest.raises(ValueError):
            validate_safe_id(bad_id)

    @pytest.mark.parametrize("good_id", [
        "role_abc123",
        "my-role",
        "my_role.v2",
        "Role123",
        "a",
    ])
    def test_validate_safe_id_accepts_good_ids(self, good_id):
        validate_safe_id(good_id)

    def test_write_role_rejects_traversal_id(self, layout):
        role = RoleData(name="Evil", id="../escape")
        with pytest.raises(ValueError):
            write_role(layout, role)

    def test_write_role_rejects_empty_id(self, layout):
        role = RoleData(name="Empty", id="")
        with pytest.raises(ValueError):
            write_role(layout, role)

    def test_write_playbook_rejects_traversal_id(self, layout):
        pb = PlaybookData(
            id="../escape",
            path=layout.playbooks_path / "evil.yml",
            name="Evil",
        )
        with pytest.raises(ValueError):
            write_playbook(layout, pb)

    def test_write_playbook_rejects_slash_id(self, layout):
        pb = PlaybookData(
            id="sub/dir",
            path=layout.playbooks_path / "evil.yml",
            name="Evil",
        )
        with pytest.raises(ValueError):
            write_playbook(layout, pb)


# ===========================================================================
# Group I — Push GET errors are not swallowed
# ===========================================================================


class TestPushUpsertErrors:

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_role_raises_on_500(self, mock_session, layout, repo_path):
        """Registry returning 500 on upsert should raise."""
        _seed_role(layout, "my_role")

        respx.put(f"{REGISTRY_URL}/roles").mock(
            return_value=httpx.Response(500, json={"detail": "Internal error"}),
        )

        with _settings_and_repo_patches(repo_path)():
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await registry_manager.push_role(mock_session, "my_role")
            assert exc_info.value.response.status_code == 500

    @respx.mock
    @pytest.mark.asyncio
    async def test_push_playbook_raises_on_500(self, mock_session, layout, repo_path):
        """Registry returning 500 on upsert should raise."""
        _seed_role(layout, "my_role")
        _mark_role_as_published(layout, "my_role", slug="my-role", uuid=ROLE_UUID_A)
        _seed_playbook(
            layout,
            "test_pb",
            roles=[PlaybookRoleEntry(role="my_role", vars={})],
        )

        respx.put(f"{REGISTRY_URL}/playbooks").mock(
            return_value=httpx.Response(500, json={"detail": "Internal error"}),
        )

        with _settings_and_repo_patches(repo_path)():
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await registry_manager.push_playbook(mock_session, "test_pb")
            assert exc_info.value.response.status_code == 500


# ===========================================================================
# Group J — Import playbook preserves description in metadata
# ===========================================================================


class TestImportPlaybookDescription:

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_playbook_retains_description(
        self, mock_session, layout, repo_path,
    ):
        """After import_playbook, both description and registry_uuid
        should be present in .racksmith.yml metadata."""
        download_resp = _playbook_download_response()
        download_resp["description"] = "Important playbook description"

        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )
        respx.get(f"{REGISTRY_URL}/roles/by-id/{ROLE_UUID_A}").mock(
            return_value=httpx.Response(200, json=_role_response()),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=_role_download_response()),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.import_playbook(mock_session, "test-pb")

        # Find the created playbook ID
        playbook_files = list(layout.playbooks_path.glob("*.yml"))
        assert len(playbook_files) == 1
        pb_id = playbook_files[0].stem

        meta = read_meta(layout)
        pb_meta = get_playbook_meta(meta, pb_id)
        assert pb_meta.get("registry_uuid") == PLAYBOOK_UUID
        assert pb_meta.get("registry_id") == "test-pb"
        assert pb_meta.get("description") == "Important playbook description"


# ===========================================================================
# Group K — Git add scopes are correct
# ===========================================================================


class TestGitAddScope:

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_role_stages_racksmith_yml(
        self, mock_session, layout, repo_path,
    ):
        """import_role git-adds both the role dir and .racksmith.yml."""
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=_role_download_response()),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        binding = MagicMock()
        binding.owner = "owner"
        binding.repo = "repo"

        with _settings_and_repo_patches(repo_path)():
            with patch("roles.registry.repos_manager") as rm:
                rm.active_repo_path.return_value = repo_path
                rm.current_repo.return_value = binding
                git_mock = AsyncMock()
                with patch("roles.registry.arun_git", git_mock):
                    await registry_manager.import_role(mock_session, "my-role")

        add_calls = [c for c in git_mock.call_args_list if "add" in c.args[1]]
        assert len(add_calls) == 1
        add_args = add_calls[0].args[1]
        assert any(".racksmith.yml" in str(a) for a in add_args)

    @respx.mock
    @pytest.mark.asyncio
    async def test_import_playbook_does_not_stage_everything(
        self, mock_session, layout, repo_path,
    ):
        """import_playbook should not use 'git add .' — it should be targeted."""
        download_resp = _playbook_download_response()
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )
        respx.get(f"{REGISTRY_URL}/roles/by-id/{ROLE_UUID_A}").mock(
            return_value=httpx.Response(200, json=_role_response()),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=_role_download_response()),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )
        respx.post(f"{REGISTRY_URL}/playbooks/test-pb/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        binding = MagicMock()
        binding.owner = "owner"
        binding.repo = "repo"

        with _settings_and_repo_patches(repo_path)():
            with patch("roles.registry.repos_manager") as rm:
                rm.active_repo_path.return_value = repo_path
                rm.current_repo.return_value = binding
                git_mock = AsyncMock()
                with patch("roles.registry.arun_git", git_mock):
                    await registry_manager.import_playbook(mock_session, "test-pb")

        # Find the playbook-import git add call (not the role-import one)
        add_calls = [c for c in git_mock.call_args_list if "add" in c.args[1]]
        for call in add_calls:
            args = call.args[1]
            assert "." not in args or all(
                a != "." for a in args
            ), "git add should not stage the entire working tree"


# ===========================================================================
# Group L — Symlink role directories are safely removed
# ===========================================================================


class TestSymlinkRemoval:

    def test_remove_symlink_role_unlinks_without_following(self, layout, tmp_path):
        """remove_role on a symlink dir unlinks the symlink, not the target."""
        target_dir = tmp_path / "real_data"
        target_dir.mkdir()
        (target_dir / "important.txt").write_text("keep me")

        role_link = layout.roles_path / "symlink_role"
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        role_link.symlink_to(target_dir)

        remove_role(layout, "symlink_role")

        assert not role_link.exists()
        assert (target_dir / "important.txt").read_text() == "keep me"


# ===========================================================================
# Group M — import_ansible skips role ID collisions
# ===========================================================================


class TestImportAnsibleCollision:

    def test_import_skips_existing_role(self, repo_path, layout):
        """If a role dir already exists, import_ansible skips it."""
        _seed_role(layout, "nginx")

        source_roles = repo_path / "ext_roles"
        source_roles.mkdir()
        nginx_src = source_roles / "nginx"
        nginx_src.mkdir()
        (nginx_src / "meta").mkdir()
        (nginx_src / "tasks").mkdir()
        (nginx_src / "meta" / "main.yml").write_text(
            "galaxy_info:\n  role_name: nginx\n  description: External\n"
        )
        (nginx_src / "tasks" / "main.yml").write_text(
            "- name: external\n  debug:\n    msg: from outside\n"
        )

        summary = import_ansible(
            repo_path,
            roles_path=str(source_roles.relative_to(repo_path)),
        )

        assert summary.roles_imported == 0
        assert summary.roles_skipped == 1

        # The existing role's tasks are untouched
        tasks = (layout.roles_path / "nginx" / "tasks" / "main.yml").read_text()
        assert "noop" in tasks

    def test_import_proceeds_for_new_roles(self, repo_path, layout):
        """Non-colliding roles are imported normally."""
        source_roles = repo_path / "ext_roles"
        source_roles.mkdir()
        redis_src = source_roles / "redis"
        redis_src.mkdir()
        (redis_src / "meta").mkdir()
        (redis_src / "tasks").mkdir()
        (redis_src / "meta" / "main.yml").write_text(
            "galaxy_info:\n  role_name: redis\n  description: Cache\n"
        )
        (redis_src / "tasks" / "main.yml").write_text(
            "- name: setup redis\n  debug:\n    msg: ok\n"
        )

        summary = import_ansible(
            repo_path,
            roles_path=str(source_roles.relative_to(repo_path)),
        )

        assert summary.roles_imported == 1
        assert summary.roles_skipped == 0


# ===========================================================================
# Group N — Whitespace-only defaults_yaml not written
# ===========================================================================


class TestDefaultsYamlStrip:

    @respx.mock
    @pytest.mark.asyncio
    async def test_whitespace_only_defaults_not_written(
        self, mock_session, layout, repo_path,
    ):
        """Whitespace-only defaults_yaml should not create a defaults/main.yml."""
        download_resp = _role_download_response()
        download_resp["defaults_yaml"] = "   \n  \n"

        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.import_role(mock_session, "my-role")

        role_dirs = [d for d in layout.roles_path.iterdir() if d.is_dir()]
        assert len(role_dirs) == 1
        defaults_dir = role_dirs[0] / "defaults"
        assert not defaults_dir.exists()

    @respx.mock
    @pytest.mark.asyncio
    async def test_real_defaults_yaml_is_written(
        self, mock_session, layout, repo_path,
    ):
        """Non-empty defaults_yaml should create defaults/main.yml."""
        download_resp = _role_download_response()
        download_resp["defaults_yaml"] = "http_port: 80\n"

        respx.post(f"{REGISTRY_URL}/roles/my-role/download").mock(
            return_value=httpx.Response(200, json=download_resp),
        )
        respx.post(f"{REGISTRY_URL}/roles/my-role/confirm-download").mock(
            return_value=httpx.Response(204),
        )

        with _settings_and_repo_patches(repo_path)():
            await registry_manager.import_role(mock_session, "my-role")

        role_dirs = [d for d in layout.roles_path.iterdir() if d.is_dir()]
        assert len(role_dirs) == 1
        defaults_path = role_dirs[0] / "defaults" / "main.yml"
        assert defaults_path.exists()
        assert "http_port" in defaults_path.read_text()


# ===========================================================================
# Group N – delete_role / delete_playbook / get_facets / get_playbook_facets
# ===========================================================================


class TestDeleteAndFacets:
    """Tests for delete and facets methods that were previously untested."""

    @respx.mock
    @pytest.mark.asyncio
    async def test_delete_role_success(self, mock_session):
        respx.delete(f"{REGISTRY_URL}/roles/my-role").mock(
            return_value=httpx.Response(204),
        )
        with _settings_and_repo_patches(None)():
            await registry_manager.delete_role(mock_session, "my-role")

    @respx.mock
    @pytest.mark.asyncio
    async def test_delete_role_raises_on_403(self, mock_session):
        respx.delete(f"{REGISTRY_URL}/roles/my-role").mock(
            return_value=httpx.Response(403, json={"detail": "forbidden"}),
        )
        with _settings_and_repo_patches(None)():
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await registry_manager.delete_role(mock_session, "my-role")
            assert exc_info.value.response.status_code == 403

    @respx.mock
    @pytest.mark.asyncio
    async def test_delete_role_raises_on_409(self, mock_session):
        respx.delete(f"{REGISTRY_URL}/roles/my-role").mock(
            return_value=httpx.Response(409, json={"detail": "referenced by playbooks"}),
        )
        with _settings_and_repo_patches(None)():
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await registry_manager.delete_role(mock_session, "my-role")
            assert exc_info.value.response.status_code == 409

    @respx.mock
    @pytest.mark.asyncio
    async def test_delete_playbook_success(self, mock_session):
        respx.delete(f"{REGISTRY_URL}/playbooks/my-pb").mock(
            return_value=httpx.Response(204),
        )
        with _settings_and_repo_patches(None)():
            await registry_manager.delete_playbook(mock_session, "my-pb")

    @respx.mock
    @pytest.mark.asyncio
    async def test_delete_playbook_raises_on_403(self, mock_session):
        respx.delete(f"{REGISTRY_URL}/playbooks/my-pb").mock(
            return_value=httpx.Response(403, json={"detail": "forbidden"}),
        )
        with _settings_and_repo_patches(None)():
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await registry_manager.delete_playbook(mock_session, "my-pb")
            assert exc_info.value.response.status_code == 403

    @respx.mock
    @pytest.mark.asyncio
    async def test_get_facets_returns_tags_and_platforms(self, mock_session):
        respx.get(f"{REGISTRY_URL}/roles/facets").mock(
            return_value=httpx.Response(200, json={
                "tags": [{"name": "network", "count": 5}],
                "platforms": [{"name": "ubuntu", "count": 3}],
            }),
        )
        with _settings_and_repo_patches(None)():
            result = await registry_manager.get_facets(mock_session)
        assert len(result.tags) == 1
        assert result.tags[0].name == "network"
        assert len(result.platforms) == 1
        assert result.platforms[0].name == "ubuntu"

    @respx.mock
    @pytest.mark.asyncio
    async def test_get_playbook_facets_returns_tags(self, mock_session):
        respx.get(f"{REGISTRY_URL}/playbooks/facets").mock(
            return_value=httpx.Response(200, json={
                "tags": [{"name": "deploy", "count": 2}],
            }),
        )
        with _settings_and_repo_patches(None)():
            result = await registry_manager.get_playbook_facets(mock_session)
        assert len(result.tags) == 1
        assert result.tags[0].name == "deploy"
