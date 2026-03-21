"""Tests for AI playbook generation: schemas, prompts, and agent streaming."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from playbooks.prompts import PLAYBOOK_SYSTEM_PROMPT
from playbooks.schemas import GeneratePlaybookRequest


class TestGenerateRequest:
    def test_valid(self) -> None:
        req = GeneratePlaybookRequest(prompt="build a web server")
        assert req.prompt == "build a web server"

    def test_rejects_empty_prompt(self) -> None:
        with pytest.raises(ValidationError):
            GeneratePlaybookRequest(prompt="")


class TestPlaybookPrompt:
    def test_contains_workflow_instructions(self) -> None:
        assert "list_roles" in PLAYBOOK_SYSTEM_PROMPT
        assert "create_role" in PLAYBOOK_SYSTEM_PROMPT
        assert "create_playbook" in PLAYBOOK_SYSTEM_PROMPT

    def test_contains_ansible_rules(self) -> None:
        assert "FQCN" in PLAYBOOK_SYSTEM_PROMPT
        assert "ansible.builtin" in PLAYBOOK_SYSTEM_PROMPT

    def test_contains_simplicity_guidance(self) -> None:
        assert "SIMPLICITY" in PLAYBOOK_SYSTEM_PROMPT


class TestAgentStream:
    """Smoke test: verify stream_agent yields the expected SSE envelope."""

    @pytest.mark.anyio
    async def test_stream_error_on_bad_model(self) -> None:
        """When the model is misconfigured, stream_agent should emit an error event."""
        from _utils.agent_stream import AgentDeps, stream_agent
        from _utils.ai import playbook_agent
        from auth.session import SessionData

        session = SessionData(access_token="test", user={}, created_at=0.0, session_id="test")
        deps = AgentDeps(session=session)

        events: list[dict] = []
        async for sse_line in stream_agent(
            playbook_agent, "test", deps, instructions="test"
        ):
            if sse_line.startswith("data: ") and sse_line.strip() != "data: [DONE]":
                try:
                    events.append(json.loads(sse_line[6:].strip()))
                except json.JSONDecodeError:
                    pass

        types = [e.get("type") for e in events]
        assert "error" in types, "Expected an error event when model is misconfigured"
