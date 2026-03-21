"""Settings API response models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class SettingsResponse(BaseModel):
    settings: dict[str, Any]


class ClearCacheResponse(BaseModel):
    deleted_keys: int


class OpenAIModelsResponse(BaseModel):
    models: list[str]
    error: str | None = None
