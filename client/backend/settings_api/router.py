"""API endpoints for user-configurable settings."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

import settings
from _utils.logging import get_logger
from _utils.openai import get_openai_client
from _utils.redis import AsyncRedis
from auth.dependencies import CurrentSession
from settings_api.schemas import ClearCacheResponse, OpenAIModelsResponse, SettingsResponse
from settings_store import EDITABLE_KEYS, get_user_settings, save_user_settings

logger = get_logger(__name__)
settings_router = APIRouter()

CHAT_MODEL_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")
NON_CHAT_KEYWORDS = (
    "realtime",
    "transcribe",
    "tts",
    "image",
    "codex",
    "oss",
    "deep-research",
    "embedding",
    "moderation",
    "dall-e",
    "whisper",
    "sora",
    "babbage",
    "davinci",
)


class SettingsUpdate(BaseModel):
    values: dict[str, str]


@settings_router.get("", response_model=SettingsResponse)
async def read_settings(
    _session: CurrentSession,
) -> SettingsResponse:
    return SettingsResponse(settings=get_user_settings())


@settings_router.put("", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    _session: CurrentSession,
) -> SettingsResponse:
    filtered = {k: v for k, v in body.values.items() if k in EDITABLE_KEYS}
    result = save_user_settings(filtered)
    return SettingsResponse(settings=result)


@settings_router.post("/clear-cache", response_model=ClearCacheResponse)
async def clear_cache(
    _session: CurrentSession,
) -> ClearCacheResponse:
    """Flush all Redis keys except auth sessions."""
    client = AsyncRedis._get_client()
    session_prefix = settings.REDIS_SESSION_PREFIX
    deleted = 0
    async for key_bytes in client.scan_iter(match="*", count=200):
        key = str(key_bytes)
        if key.startswith(session_prefix):
            continue
        await client.delete(key)
        deleted += 1

    logger.info("cache_cleared", deleted_keys=deleted)
    return ClearCacheResponse(deleted_keys=deleted)


@settings_router.get("/openai-models", response_model=OpenAIModelsResponse)
async def list_openai_models(
    _session: CurrentSession,
) -> OpenAIModelsResponse:
    if not settings.OPENAI_API_KEY:
        return OpenAIModelsResponse(models=[])

    try:
        client = get_openai_client()
        page = await client.models.list()
    except Exception as exc:
        logger.warning("openai_models_fetch_failed", error=str(exc))
        return OpenAIModelsResponse(models=[], error="Failed to fetch models")

    ids: list[str] = sorted(
        model.id
        for model in page.data
        if any(model.id.startswith(p) for p in CHAT_MODEL_PREFIXES)
        and not any(kw in model.id for kw in NON_CHAT_KEYWORDS)
    )
    return OpenAIModelsResponse(models=ids)
