"""Roles CRUD and run router."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
import yaml
from pydantic import BaseModel, ValidationError

import settings
from github.managers import auth_manager
from github.misc import get_session
from roles.managers import role_manager
from roles.schemas import (
    RoleCreateRequest,
    RoleFromYamlRequest,
    RoleRunRequest,
    RoleUpdateRequest,
)

from roles.prompts import ROLE_SYSTEM_PROMPT

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str




def _validate_role_yaml(yaml_text: str) -> str | None:
    """Return error string if invalid, None if valid."""
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as e:
        return f"Invalid YAML syntax: {e}"
    if not isinstance(data, dict):
        return "YAML must be a mapping"
    try:
        RoleCreateRequest.model_validate(data)
    except ValidationError as e:
        return str(e)
    return None


async def _generate_with_validation(prompt: str) -> AsyncGenerator[str]:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": ROLE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    for attempt in range(settings.OPENAI_ROLE_GENERATE_RETRIES + 1):
        is_last = attempt == settings.OPENAI_ROLE_GENERATE_RETRIES
        use_stream = attempt == 0 or is_last

        if use_stream:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL, messages=messages, stream=True,
            )
            accumulated = ""
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    accumulated += delta
                    yield f"data: {json.dumps(delta)}\n\n"

            if is_last:
                yield "data: [DONE]\n\n"
                return

            errors = _validate_role_yaml(accumulated)
            if not errors:
                yield "data: [DONE]\n\n"
                return

            yield "data: [RETRY]\n\n"
            messages.append({"role": "assistant", "content": accumulated})
        else:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL, messages=messages, stream=False,
            )
            yaml_text = response.choices[0].message.content or ""

            errors = _validate_role_yaml(yaml_text)
            if not errors:
                yield f"data: {json.dumps(yaml_text)}\n\n"
                yield "data: [DONE]\n\n"
                return

            yield "data: [RETRY]\n\n"
            messages.append({"role": "assistant", "content": yaml_text})

        messages.append({"role": "user", "content": (
            f"This YAML has validation errors:\n{errors}\n\n"
            "Fix them and output only the corrected YAML."
        )})


@router.post("/generate")
async def generate_role(
    body: GenerateRequest,
    _session=Depends(auth_manager.get_current_session),
):
    """Generate an Ansible role from a natural-language prompt via AI."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI generation is not configured (OPENAI_API_KEY missing)")
    return StreamingResponse(
        _generate_with_validation(body.prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/from-yaml", status_code=201)
def create_role_from_yaml(
    body: RoleFromYamlRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Parse a single YAML document containing both role metadata and tasks, then create the role."""
    try:
        data = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML must be a mapping (dict)")
    try:
        request = RoleCreateRequest.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    try:
        role = role_manager.create_role(session, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.get("")
def list_roles(session=Depends(auth_manager.get_current_session)):
    """List all roles in the active repo."""
    return {"roles": role_manager.list_roles(session)}


# Static /runs routes must come before /{slug} so "runs" is not matched as slug
@router.get("/runs")
async def list_runs(
    role_slug: str | None = None,
    session=Depends(auth_manager.get_current_session),
):
    """List role runs, optionally filtered by role slug."""
    return {"runs": await role_manager.list_runs(session, role_slug=role_slug)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
    """Get a single role run by ID."""
    try:
        run = await role_manager.get_run(session, run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run": run}


@router.websocket("/runs/{run_id}/stream")
async def stream_run(
    websocket: WebSocket,
    run_id: str,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    """Stream live role run output over WebSocket."""
    session = get_session(session_id)
    if not session:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    await websocket.accept()
    try:
        await role_manager.stream_run(session, run_id, websocket)
    except WebSocketDisconnect:
        return
    except KeyError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=4404)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)


@router.get("/{slug}/detail")
def get_role_detail(slug: str, session=Depends(auth_manager.get_current_session)):
    """Get full role detail including raw YAML content."""
    try:
        return {"role": role_manager.get_role_detail(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{slug}")
def get_role(slug: str, session=Depends(auth_manager.get_current_session)):
    """Get role summary by slug."""
    try:
        return {"role": role_manager.get_role(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", status_code=201)
def create_role(
    body: RoleCreateRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Create a new role from structured input."""
    try:
        role = role_manager.create_role(session, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.put("/{slug}")
def update_role(
    slug: str,
    body: RoleUpdateRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Update an existing role via raw YAML."""
    try:
        role = role_manager.update_role(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.delete("/{slug}", status_code=204)
def delete_role(slug: str, session=Depends(auth_manager.get_current_session)):
    """Delete a role by slug."""
    try:
        role_manager.delete_role(session, slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{slug}/runs", status_code=201)
async def create_run(
    slug: str,
    body: RoleRunRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Queue a new role run against the given targets."""
    try:
        run = await role_manager.create_run(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": run}
