"""Request/response models for AI chat API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatCreateResponse(BaseModel):
    chat_id: str


class ChatUiMessage(BaseModel):
    kind: Literal["user", "assistant", "tool", "system", "other"]
    text: str


class ChatMessagesResponse(BaseModel):
    items: list[ChatUiMessage]


class ChatStreamRequest(BaseModel):
    content: str = Field(min_length=1, max_length=120_000)
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional keys: hosts, playbooks, roles, runs, racks — each a list of string ids.",
    )
