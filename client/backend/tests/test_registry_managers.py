"""Unit tests for registry/managers."""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest
import respx

from roles.registry import registry_manager

ROLE_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@respx.mock
@pytest.mark.asyncio
async def test_list_roles(mock_session):
    with patch("roles.registry.settings") as s:
        s.REGISTRY_URL = "http://registry.test"
        respx.get("http://registry.test/roles").mock(
            return_value=httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": ROLE_UUID,
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
        result = await registry_manager.list_roles(mock_session)
    assert len(result.items) == 1
    assert result.items[0].id == ROLE_UUID


@respx.mock
@pytest.mark.asyncio
async def test_get_role(mock_session):
    with patch("roles.registry.settings") as s:
        s.REGISTRY_URL = "http://registry.test"
        respx.get(f"http://registry.test/roles/{ROLE_UUID}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": ROLE_UUID,
                    "owner": {"username": "user", "avatar_url": ""},
                    "download_count": 0,
                    "created_at": "2024-01-01",
                    "updated_at": None,
                    "latest_version": {
                        "id": "v1",
                        "role_id": ROLE_UUID,
                        "version_number": 1,
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
        result = await registry_manager.get_role(mock_session, ROLE_UUID)
    assert result.id == ROLE_UUID
