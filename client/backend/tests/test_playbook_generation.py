"""Tests for AI playbook generation: schemas, prompts, session, and orchestrator."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from _utils.schemas import RoleInputSpec, RoleOutputSpec
from playbooks.prompts import build_planner_system_prompt
from playbooks.schemas import (
    GeneratePlaybookRequest,
    PlaybookPlan,
    PlaybookPlanRoleCreate,
    PlaybookPlanRoleReuse,
    RoleCatalogEntry,
)

# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestPlaybookPlanSchemas:
    def test_valid_reuse_role(self) -> None:
        entry = PlaybookPlanRoleReuse(action="reuse", role_id="nginx_role", vars={"port": "80"})
        assert entry.action == "reuse"
        assert entry.role_id == "nginx_role"

    def test_valid_create_role(self) -> None:
        entry = PlaybookPlanRoleCreate(
            action="create",
            name="My Role",
            description="Installs stuff",
            generation_prompt="Create a role that installs packages.",
            expected_inputs=[RoleInputSpec(key="packages", type="list")],
            expected_outputs=[RoleOutputSpec(key="installed_versions", type="list")],
        )
        assert entry.action == "create"
        assert entry.name == "My Role"
        assert len(entry.expected_inputs) == 1

    def test_create_role_requires_generation_prompt(self) -> None:
        with pytest.raises(ValidationError):
            PlaybookPlanRoleCreate(
                action="create",
                name="Bad",
                description="No prompt",
                generation_prompt="",
            )

    def test_valid_plan(self) -> None:
        plan = PlaybookPlan(
            name="Setup",
            description="Full setup",
            become=True,
            roles=[
                PlaybookPlanRoleReuse(action="reuse", role_id="base"),
                PlaybookPlanRoleCreate(
                    action="create",
                    name="Custom",
                    description="Custom role",
                    generation_prompt="Write tasks...",
                ),
            ],
        )
        assert len(plan.roles) == 2
        assert plan.become is True

    def test_plan_requires_at_least_one_role(self) -> None:
        with pytest.raises(ValidationError):
            PlaybookPlan(name="Empty", description="Nothing", roles=[])

    def test_generate_request_accepts_optional_session_id(self) -> None:
        req = GeneratePlaybookRequest(prompt="build a web server")
        assert req.generation_session_id is None

        req2 = GeneratePlaybookRequest(prompt="add monitoring", generation_session_id="abc123")
        assert req2.generation_session_id == "abc123"

    def test_generate_request_rejects_empty_prompt(self) -> None:
        with pytest.raises(ValidationError):
            GeneratePlaybookRequest(prompt="")


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


class TestPlannerPrompt:
    def test_empty_catalog_produces_valid_prompt(self) -> None:
        prompt = build_planner_system_prompt([])
        assert "AVAILABLE ROLES" in prompt
        assert "[]" in prompt

    def test_catalog_entries_serialized(self) -> None:
        catalog = [
            RoleCatalogEntry(
                id="nginx",
                name="Nginx",
                description="Install nginx",
                inputs=[RoleInputSpec(key="port", type="string", label="Port")],
                outputs=[RoleOutputSpec(key="nginx_pid", description="PID")],
            ),
        ]
        prompt = build_planner_system_prompt(catalog)
        assert '"nginx"' in prompt
        assert '"port"' in prompt
        assert '"nginx_pid"' in prompt

    def test_prompt_contains_rules_and_example(self) -> None:
        prompt = build_planner_system_prompt([])
        assert "REUSE existing roles" in prompt
        assert "Storage Setup" in prompt


# ---------------------------------------------------------------------------
# Generation session persistence
# ---------------------------------------------------------------------------


class TestGenerationSession:
    @pytest.fixture(autouse=True)
    def _mock_redis(self):
        self.store: dict[str, str] = {}

        async def fake_setex(key: str, ttl: int, value: str) -> None:
            self.store[key] = value

        async def fake_get(key: str) -> str | None:
            return self.store.get(key)

        async def fake_expire(key: str, ttl: int) -> bool:
            return key in self.store

        with (
            patch("_utils.generation_session.AsyncRedis.setex", side_effect=fake_setex),
            patch("_utils.generation_session.AsyncRedis.get", side_effect=fake_get),
            patch("_utils.generation_session.AsyncRedis.expire", side_effect=fake_expire),
        ):
            yield

    @pytest.mark.anyio
    async def test_save_and_load(self) -> None:
        from _utils.generation_session import load_generation_session, save_generation_session

        state = {"messages": [{"role": "user", "content": "hi"}], "plan": {}}
        await save_generation_session("sess1", state)
        loaded = await load_generation_session("sess1")
        assert loaded is not None
        assert loaded["messages"][0]["content"] == "hi"

    @pytest.mark.anyio
    async def test_missing_session_returns_none(self) -> None:
        from _utils.generation_session import load_generation_session

        assert await load_generation_session("nonexistent") is None

    @pytest.mark.anyio
    async def test_refresh_on_existing(self) -> None:
        from _utils.generation_session import (
            refresh_generation_session,
            save_generation_session,
        )

        await save_generation_session("sess2", {"x": 1})
        await refresh_generation_session("sess2")


# ---------------------------------------------------------------------------
# Orchestrator (mocked LLM)
# ---------------------------------------------------------------------------


class TestGeneratePlaybookOrchestrator:
    @pytest.fixture
    def mock_plan(self) -> PlaybookPlan:
        return PlaybookPlan(
            name="Test Playbook",
            description="Integration test",
            become=True,
            roles=[
                PlaybookPlanRoleReuse(action="reuse", role_id="existing_role", vars={"key": "val"}),
                PlaybookPlanRoleCreate(
                    action="create",
                    name="New Role",
                    description="Does something",
                    generation_prompt="Generate tasks...",
                    expected_inputs=[RoleInputSpec(key="x", type="string")],
                ),
            ],
        )

    @pytest.mark.anyio
    async def test_orchestrator_creates_roles_and_playbook(
        self, with_playbooks_repo_mock, layout, mock_plan
    ) -> None:
        from unittest.mock import MagicMock

        from playbooks.managers import playbook_manager
        from roles.schemas import RoleCreate

        layout.roles_path.mkdir(parents=True, exist_ok=True)
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)

        # Write a minimal existing role so the catalog has it
        import yaml as _yaml

        (layout.roles_path / "existing_role").mkdir()
        (layout.roles_path / "existing_role" / "meta").mkdir()
        (layout.roles_path / "existing_role" / "meta" / "main.yml").write_text(
            _yaml.safe_dump({
                "galaxy_info": {"role_name": "Existing", "description": "Existing role"},
                "argument_specs": {"main": {"options": {}}},
            })
        )

        mock_planner_result = MagicMock()
        mock_planner_result.output = mock_plan
        mock_planner_result.all_messages.return_value = []

        mock_role_create = RoleCreate(
            name="New Role",
            description="Does something",
            tasks=[{"name": "noop", "ansible.builtin.debug": {"msg": "ok"}}],
        )
        mock_role_result = MagicMock()
        mock_role_result.output = mock_role_create

        with (
            patch("_utils.ai.planner_agent") as planner_mock,
            patch("_utils.ai.role_agent") as role_mock,
            patch("_utils.generation_session.AsyncRedis.setex", new_callable=AsyncMock),
            patch("_utils.generation_session.AsyncRedis.get", new_callable=AsyncMock, return_value=None),
        ):
            planner_mock.run = AsyncMock(return_value=mock_planner_result)
            role_mock.run = AsyncMock(return_value=mock_role_result)

            events: list[dict] = []
            async for sse_line in playbook_manager.generate_playbook(
                with_playbooks_repo_mock, "test prompt"
            ):
                if sse_line.startswith("data: ") and sse_line.strip() != "data: [DONE]":
                    payload = sse_line[6:].strip()
                    try:
                        events.append(json.loads(payload))
                    except json.JSONDecodeError:
                        pass

            steps = [e.get("step") for e in events]
            assert "planning" in steps
            assert "planned" in steps
            assert "role_created" in steps
            assert "done" in steps

            planner_mock.run.assert_called_once()
            role_mock.run.assert_called_once()

            done_event = next(e for e in events if e.get("step") == "done")
            assert "playbook_id" in done_event
