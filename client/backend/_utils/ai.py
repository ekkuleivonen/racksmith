"""Shared PydanticAI agents and model configuration."""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

import settings
from playbooks.schemas import PlaybookPlan
from roles.schemas import RoleCreate


def get_model() -> OpenAIModel:
    """Build an OpenAIModel from current settings (called per-request)."""
    provider = OpenAIProvider(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
    )
    return OpenAIModel(settings.OPENAI_MODEL, provider=provider)


role_agent: Agent[None, RoleCreate] = Agent(
    output_type=RoleCreate,
    retries=2,
)

planner_agent: Agent[None, PlaybookPlan] = Agent(
    output_type=PlaybookPlan,
    retries=2,
)
