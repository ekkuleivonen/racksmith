"""Roles CRUD and run router."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import APIRouter, Cookie, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

import yaml
from pydantic import ValidationError

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

router = APIRouter()

ROLE_SYSTEM_PROMPT = """\
You generate Racksmith role YAML. Output ONLY a single raw YAML document. \
Never wrap it in markdown code fences. No explanations before or after.

Required top-level keys:
  slug        – lowercase alphanumeric + hyphens (e.g. install-nginx)
  name        – human-readable name
  description – short summary

Optional top-level keys:
  labels        – list of tags (e.g. [web, nginx])
  compatibility – mapping with os_family list (e.g. {os_family: [debian, redhat]})
  inputs        – list of variable definitions (see below)
  tasks         – list of Ansible tasks (written to tasks/main.yml)

Each input item: key, label, type (string|boolean|select|secret), \
placeholder, default, required, options (for select), interactive (for runtime prompts).

Example output:

slug: install-nginx
name: Install Nginx
description: Install and configure Nginx web server
labels: [web, nginx]
compatibility:
  os_family: [debian, redhat]
inputs:
  - key: nginx_port
    label: Port
    type: string
    placeholder: "80"
    default: "80"
    required: true
tasks:
  - name: Install nginx
    ansible.builtin.package:
      name: nginx
      state: present
  - name: Start nginx
    ansible.builtin.service:
      name: nginx
      state: started
      enabled: true"""


class GenerateRequest(BaseModel):
    prompt: str


async def _stream_role_yaml(prompt: str) -> AsyncGenerator[str]:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": ROLE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        stream=True,
    )
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield f"data: {delta}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/generate")
async def generate_role(
    body: GenerateRequest,
    _session=Depends(auth_manager.get_current_session),
):
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI generation is not configured (OPENAI_API_KEY missing)")
    return StreamingResponse(
        _stream_role_yaml(body.prompt),
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
    return {"roles": role_manager.list_roles(session)}


# Static /runs routes must come before /{slug} so "runs" is not matched as slug
@router.get("/runs")
async def list_runs(
    role_slug: str | None = None,
    session=Depends(auth_manager.get_current_session),
):
    return {"runs": await role_manager.list_runs(session, role_slug=role_slug)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, session=Depends(auth_manager.get_current_session)):
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
    try:
        return {"role": role_manager.get_role_detail(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{slug}")
def get_role(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"role": role_manager.get_role(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", status_code=201)
def create_role(
    body: RoleCreateRequest,
    session=Depends(auth_manager.get_current_session),
):
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
    try:
        role = role_manager.update_role(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"role": role}


@router.delete("/{slug}", status_code=204)
def delete_role(slug: str, session=Depends(auth_manager.get_current_session)):
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
    try:
        run = await role_manager.create_run(session, slug, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": run}
