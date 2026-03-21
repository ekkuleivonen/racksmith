"""Daemon Ansible HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ansible.validate import validate_become_password
from auth import verify_daemon_token

router = APIRouter()


class ValidateBecomeRequest(BaseModel):
    inventory_yaml: str
    host_vars: dict[str, str] = {}
    group_vars: dict[str, str] = {}
    hosts: list[str]
    become_password: str


@router.post("/validate-become", dependencies=[Depends(verify_daemon_token)])
async def api_validate_become(body: ValidateBecomeRequest):
    try:
        await validate_become_password(
            body.inventory_yaml,
            body.host_vars,
            body.group_vars,
            body.hosts,
            body.become_password,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"status": "ok"}
