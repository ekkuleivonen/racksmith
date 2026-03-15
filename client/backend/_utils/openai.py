"""Shared AsyncOpenAI client that respects runtime settings."""

from __future__ import annotations

from openai import AsyncOpenAI

import settings


def get_openai_client() -> AsyncOpenAI:
    """Return an AsyncOpenAI client configured from current settings.

    Called per-request so it always picks up runtime changes to
    OPENAI_API_KEY and OPENAI_BASE_URL made via the settings UI.
    """
    base_url = settings.OPENAI_BASE_URL or None
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=base_url)
