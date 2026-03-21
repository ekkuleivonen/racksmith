"""AI endpoints: unified Racksmith chat (streaming) backed by Redis."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import settings
from _utils.agent_stream import stream_racksmith_turn
from _utils.ai import RACKSMITH_CHAT_INSTRUCTIONS, racksmith_agent
from _utils.exceptions import RepoNotAvailableError
from auth.dependencies import CurrentSession

from .chat_context import build_agent_deps_and_prefix, parse_context_payload
from .chat_schemas import ChatCreateResponse, ChatMessagesResponse, ChatStreamRequest, ChatUiMessage
from .chat_store import ai_chat_store
from .chat_view import model_messages_to_ui

router = APIRouter()


def _require_openai() -> None:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI generation is not configured (OPENAI_API_KEY missing)",
        )


@router.post("/chats", response_model=ChatCreateResponse)
async def create_chat(session: CurrentSession) -> ChatCreateResponse:
    """Start a new chat thread (empty history in Redis)."""
    try:
        chat_id = await ai_chat_store.create(session)
    except RepoNotAvailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ChatCreateResponse(chat_id=chat_id)


@router.get("/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def get_chat_messages(chat_id: str, session: CurrentSession) -> ChatMessagesResponse:
    """Return a simplified transcript for the SPA."""
    try:
        raw = await ai_chat_store.load_messages(session, chat_id)
    except RepoNotAvailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if raw is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    rows = model_messages_to_ui(raw)
    return ChatMessagesResponse(items=[ChatUiMessage.model_validate(r) for r in rows])


@router.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, session: CurrentSession) -> None:
    try:
        deleted = await ai_chat_store.delete(session, chat_id)
    except RepoNotAvailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat not found")


@router.post("/chats/{chat_id}/stream")
async def chat_turn_stream(
    chat_id: str,
    body: ChatStreamRequest,
    session: CurrentSession,
) -> StreamingResponse:
    """Run one user turn; stream SSE; persist full message history on success."""
    _require_openai()
    try:
        prior = await ai_chat_store.load_messages(session, chat_id)
    except RepoNotAvailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if prior is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    ctx = parse_context_payload(body.context)

    async def event_stream():
        try:
            deps, prefix = await build_agent_deps_and_prefix(session, ctx)
        except ValueError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        full_prompt = prefix + body.content.strip()
        updated: list = []
        async for chunk in stream_racksmith_turn(
            racksmith_agent,
            user_prompt=full_prompt,
            deps=deps,
            message_history=prior or None,
            instructions=RACKSMITH_CHAT_INSTRUCTIONS,
            persisted_messages=updated,
        ):
            yield chunk
        if updated:
            try:
                await ai_chat_store.save_messages(session, chat_id, updated)
            except ValueError as exc:
                err = json.dumps({"type": "error", "message": f"Failed to save chat: {exc}"})
                yield f"data: {err}\n\n"
                yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
