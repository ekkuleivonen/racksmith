"""Actions CRUD router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import yaml
from pydantic import ValidationError

from actions.managers import action_manager
from actions.schemas import ActionCreateRequest, ActionFromYamlRequest
from github.managers import auth_manager

router = APIRouter()


@router.post("/from-yaml", status_code=201)
def create_action_from_yaml(
    body: ActionFromYamlRequest,
    session=Depends(auth_manager.get_current_session),
):
    """Parse a single YAML document containing both action metadata and tasks, then create the action."""
    try:
        data = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML must be a mapping (dict)")
    try:
        request = ActionCreateRequest.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    try:
        action = action_manager.create_action(session, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"action": action}


@router.get("")
def list_actions(session=Depends(auth_manager.get_current_session)):
    return {"actions": action_manager.list_actions(session)}


@router.get("/{slug}")
def get_action(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        return {"action": action_manager.get_action(session, slug)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", status_code=201)
def create_action(
    body: ActionCreateRequest,
    session=Depends(auth_manager.get_current_session),
):
    try:
        action = action_manager.create_action(session, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"action": action}


@router.delete("/{slug}", status_code=204)
def delete_action(slug: str, session=Depends(auth_manager.get_current_session)):
    try:
        action_manager.delete_action(session, slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
