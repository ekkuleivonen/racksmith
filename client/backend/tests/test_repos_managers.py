"""Unit tests for repos/managers."""

from __future__ import annotations

import json
from unittest.mock import patch

import httpx
import pytest
import respx

from repo.managers import repos_manager


@pytest.fixture
def with_repo_mock(mock_session, workspace_with_repo):
    """Use workspace_with_repo; session resolves via active binding."""
    return mock_session


class TestReposManagerActivateLocalRepo:
    @pytest.mark.asyncio
    async def test_activate_local_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repo.managers.ensure_racksmith_branch"), patch(
            "repo.managers.migrate_repo"
        ):
            binding = await repos_manager.activate_local_repo(
                with_repo_mock, owner="owner", repo="repo"
            )
        assert binding.owner == "owner"
        assert binding.repo == "repo"
        assert binding.path

    @pytest.mark.asyncio
    async def test_activate_local_repo_missing_dir_raises(self, mock_session, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        user_dir = ws / "test-user-123"
        user_dir.mkdir()
        binding_path = user_dir / ".racksmith-user.json"
        binding_path.write_text(
            json.dumps({"user_id": "test-user-123", "owner": "owner", "repo": "repo"}),
            encoding="utf-8",
        )
        import settings
        with patch.object(settings, "REPOS_WORKSPACE", str(ws)):
            with pytest.raises(FileNotFoundError, match="missing"):
                await repos_manager.activate_local_repo(mock_session, owner="owner", repo="repo")


class TestReposManagerListLocalRepos:
    @pytest.mark.asyncio
    async def test_list_local_repos_empty(self, with_repo_mock):
        result = await repos_manager.list_local_repos(with_repo_mock)
        assert isinstance(result, list)


class TestReposManagerDropRepo:
    @pytest.mark.asyncio
    async def test_drop_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repo.managers.ensure_racksmith_branch"), patch(
            "repo.managers.migrate_repo"
        ):
            await repos_manager.activate_local_repo(with_repo_mock, owner="owner", repo="repo")
        repos_manager.drop_repo(with_repo_mock, owner="owner", repo="repo")
        assert not repo_dir.exists()


class TestReposManagerStatus:
    @pytest.mark.asyncio
    async def test_status_with_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repo.managers.ensure_racksmith_branch"), patch(
            "repo.managers.migrate_repo"
        ):
            await repos_manager.activate_local_repo(with_repo_mock, owner="owner", repo="repo")
        result = repos_manager.status(with_repo_mock, hosts_ready=False)
        assert result.user
        assert hasattr(result, "repo_ready")
        assert hasattr(result, "hosts_ready")


@respx.mock
class TestReposManagerGitHubApi:
    @pytest.mark.asyncio
    async def test_list_repos(self):
        respx.get("https://api.github.com/user/repos").mock(
            return_value=httpx.Response(
                200,
                json=[
                    {
                        "id": 1,
                        "name": "my-repo",
                        "full_name": "user/my-repo",
                        "owner": {"login": "user"},
                        "private": True,
                    }
                ],
            )
        )
        result = await repos_manager.list_repos("gh_token")
        assert len(result) == 1
        assert result[0].name == "my-repo"
        assert result[0].full_name == "user/my-repo"
