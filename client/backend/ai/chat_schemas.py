"""Request/response models for AI chat API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatCreateResponse(BaseModel):
    chat_id: str


UiKind = Literal[
    "user",
    "assistant",
    "tool_call",
    "tool_result",
    "thinking",
    "system",
    "other",
]


class ChatUiMessage(BaseModel):
    kind: UiKind
    text: str = ""
    tool: str | None = None
    args: dict[str, Any] | None = None
    result_preview: str | None = None
    outcome: str | None = None
    result_type: str | None = None
    exit_code: int | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    run_status: str | None = None


class ChatMessagesResponse(BaseModel):
    items: list[ChatUiMessage]


class ChatStreamRequest(BaseModel):
    content: str = Field(min_length=1, max_length=120_000)
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional keys: hosts, playbooks, roles, groups, runs, racks — each a list of string ids.",
    )
