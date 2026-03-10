"""Unit tests for repos/managers."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
import respx

from repos.managers import repos_manager


@pytest.fixture
def with_repo_mock(mock_session, workspace_with_repo):
    """Use workspace_with_repo; session resolves to it via binding."""
    ws, user_dir, repo_dir = workspace_with_repo
    return mock_session


class TestReposManagerActivateLocalRepo:
    def test_activate_local_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repos.managers.ensure_racksmith_branch"), patch(
            "repos.managers.migrate_repo"
        ):
            binding = repos_manager.activate_local_repo(
                with_repo_mock, owner="owner", repo="repo"
            )
        assert binding["owner"] == "owner"
        assert binding["repo"] == "repo"
        assert "path" in binding

    def test_activate_local_repo_missing_dir_raises(self, mock_session, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        user_dir = ws / "test-user-123"
        user_dir.mkdir()
        # Don't create owner_repo - it's missing
        binding_path = user_dir / ".racksmith-user.json"
        binding_path.write_text(
            json.dumps({"user_id": "test-user-123", "owner": "owner", "repo": "repo"}),
            encoding="utf-8",
        )
        import settings
        with patch.object(settings, "REPOS_WORKSPACE", str(ws)):
            with pytest.raises(FileNotFoundError, match="missing"):
                repos_manager.activate_local_repo(mock_session, owner="owner", repo="repo")


class TestReposManagerListLocalRepos:
    def test_list_local_repos_empty(self, with_repo_mock):
        result = repos_manager.list_local_repos(with_repo_mock)
        # owner_repo may not have git remote, so might be empty
        assert isinstance(result, list)


class TestReposManagerDropRepo:
    def test_drop_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repos.managers.ensure_racksmith_branch"), patch(
            "repos.managers.migrate_repo"
        ):
            repos_manager.activate_local_repo(with_repo_mock, owner="owner", repo="repo")
        repos_manager.drop_repo(with_repo_mock, owner="owner", repo="repo")
        assert not repo_dir.exists()


class TestReposManagerStatus:
    def test_status_with_repo(self, with_repo_mock, workspace_with_repo):
        ws, user_dir, repo_dir = workspace_with_repo
        with patch("repos.managers.ensure_racksmith_branch"), patch(
            "repos.managers.migrate_repo"
        ):
            repos_manager.activate_local_repo(with_repo_mock, owner="owner", repo="repo")
        result = repos_manager.status(with_repo_mock, hosts_ready=False)
        assert "user" in result
        assert "repo_ready" in result
        assert "hosts_ready" in result


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
        assert result[0]["name"] == "my-repo"
        assert result[0]["full_name"] == "user/my-repo"
