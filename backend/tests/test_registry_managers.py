"""Unit tests for registry/managers."""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest
import respx

import registry.managers as registry_mgrs


@pytest.fixture
def mock_session():
    return type("Session", (), {
        "user": {"id": "123", "login": "test"},
        "access_token": "gh_token",
    })()


@respx.mock
@pytest.mark.asyncio
async def test_list_roles(mock_session):
    with patch("registry.managers.settings") as s:
        s.REGISTRY_URL = "http://registry.test"
        respx.get("http://registry.test/roles").mock(
            return_value=httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "1",
                            "slug": "install-packages",
                            "owner": {"username": "user", "avatar_url": ""},
                            "download_count": 0,
                            "created_at": "2024-01-01",
                            "updated_at": None,
                            "latest_version": None,
                        }
                    ],
                    "total": 1,
                    "page": 1,
                    "per_page": 20,
                },
            )
        )
        result = await registry_mgrs.list_roles(
            mock_session,
            racksmith_version="1.0.0",
        )
    assert len(result.items) == 1
    assert result.items[0].slug == "install-packages"


@respx.mock
@pytest.mark.asyncio
async def test_get_role(mock_session):
    with patch("registry.managers.settings") as s:
        s.REGISTRY_URL = "http://registry.test"
        respx.get("http://registry.test/roles/my-role").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "1",
                    "slug": "my-role",
                    "owner": {"username": "user", "avatar_url": ""},
                    "download_count": 0,
                    "created_at": "2024-01-01",
                    "updated_at": None,
                    "latest_version": {
                        "id": "v1",
                        "version_number": 1,
                        "racksmith_version": "1.0.0",
                        "name": "My Role",
                        "description": "A test role",
                        "platforms": [],
                        "tags": [],
                        "inputs": [],
                        "tasks_yaml": "",
                        "defaults_yaml": "",
                        "meta_yaml": "",
                        "created_at": "2024-01-01",
                    },
                },
            )
        )
        result = await registry_mgrs.get_role(mock_session, "my-role")
    assert result.slug == "my-role"
