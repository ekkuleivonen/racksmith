"""Rack router backed by GitHub repositories and .racksmith JSON state."""

from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
from datetime import UTC, datetime
from ipaddress import ip_address
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import settings
from auth.session import get_current_session

router = APIRouter()

_RACK_TOPIC = "racksmith-rack"
_RACK_FILE = ".racksmith/rack.json"
_COLS_BY_WIDTH = {10: 6, 19: 12}


class RackItemInput(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    position_u_start: int = Field(ge=1)
    position_u_height: int = Field(ge=1)
    position_col_start: int = Field(ge=0)
    position_col_count: int = Field(ge=1)
    has_no_ip: bool = False
    ip_address: str | None = None
    name: str | None = None


class CreateRackRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rack_width_inches: int
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int | None = None
    items: list[RackItemInput] = Field(default_factory=list)


class CreateRackItemRequest(RackItemInput):
    pass


class UpdateRackItemRequest(BaseModel):
    position_u_start: int = Field(ge=1)
    position_u_height: int = Field(ge=1)
    position_col_start: int = Field(ge=0)
    position_col_count: int = Field(ge=1)
    has_no_ip: bool = False
    ip_address: str | None = None
    name: str | None = None


def _workspace() -> Path:
    return Path(settings.REPOS_WORKSPACE)


def _repo_path(owner_login: str, repo_name: str) -> Path:
    workspace = _workspace()
    target = (workspace / f"{owner_login}_{repo_name}").resolve()
    workspace_resolved = workspace.resolve()
    if not str(target).startswith(str(workspace_resolved)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


def _rack_file_path(repo_path: Path) -> Path:
    return repo_path / ".racksmith" / "rack.json"


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-]+", "-", value.strip().lower()).strip("-")
    return slug or "rack"


def _run_git(repo_path: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "git command failed").strip()
        raise HTTPException(status_code=500, detail=detail)
    return result


def _validate_width(width: int) -> None:
    if width not in (10, 19):
        raise HTTPException(status_code=400, detail="rack_width_inches must be 10 or 19")


def _validate_item_cols(max_cols: int, *, position_col_start: int, position_col_count: int) -> None:
    if position_col_start < 0 or position_col_count < 1:
        raise HTTPException(status_code=400, detail="Invalid item column range")
    if position_col_start + position_col_count > max_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Item columns must fit within {max_cols} columns",
        )


def _validate_item_network(*, has_no_ip: bool, ip_value: str | None) -> str | None:
    if has_no_ip:
        return None
    if not ip_value or not ip_value.strip():
        raise HTTPException(status_code=400, detail="ip_address is required unless has_no_ip is true")
    try:
        return str(ip_address(ip_value.strip()))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid ip_address") from exc


def _is_valid_rack_state(state: Any) -> bool:
    if not isinstance(state, dict):
        return False
    if state.get("kind") != "racksmith/rack":
        return False
    if state.get("schema_version") != 1:
        return False
    meta = state.get("meta")
    if not isinstance(meta, dict):
        return False
    if not isinstance(meta.get("rack_units"), int):
        return False
    if meta.get("rack_width_inches") not in (10, 19):
        return False
    if not isinstance(state.get("items"), list):
        return False
    return True


def _load_rack_state(repo_path: Path) -> dict:
    rack_file = _rack_file_path(repo_path)
    if not rack_file.exists():
        raise HTTPException(status_code=404, detail="Rack config not found")
    try:
        state = json.loads(rack_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Rack config is invalid JSON") from exc
    if not _is_valid_rack_state(state):
        raise HTTPException(status_code=500, detail="Rack config schema is invalid")
    return state


def _save_rack_state(repo_path: Path, state: dict) -> None:
    rack_file = _rack_file_path(repo_path)
    rack_file.parent.mkdir(parents=True, exist_ok=True)
    rack_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def _commit_and_push(repo_path: Path, message: str) -> None:
    _run_git(repo_path, ["add", _RACK_FILE])
    diff = _run_git(repo_path, ["diff", "--cached", "--name-only"], check=False)
    if not diff.stdout.strip():
        return
    _run_git(
        repo_path,
        [
            "-c",
            "user.name=Racksmith",
            "-c",
            "user.email=racksmith@local",
            "commit",
            "-m",
            message,
        ],
    )
    _run_git(repo_path, ["push", "origin", "HEAD"])


def _rack_summary_from_state(repo_name: str, state: dict) -> dict:
    meta = state.get("meta", {})
    items = state.get("items", [])
    return {
        "id": repo_name,
        "owner_login": meta.get("owner_login"),
        "name": meta.get("name"),
        "rack_width_inches": meta.get("rack_width_inches"),
        "rack_units": meta.get("rack_units"),
        "created_at": meta.get("created_at"),
        "item_count": len(items),
    }


async def _fetch_repo_topics(client: httpx.AsyncClient, *, owner: str, repo: str, token: str) -> set[str]:
    resp = await client.get(
        f"https://api.github.com/repos/{owner}/{repo}/topics",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
    )
    if resp.status_code != 200:
        return set()
    names = resp.json().get("names", [])
    if not isinstance(names, list):
        return set()
    return {str(name) for name in names}


async def _fetch_rack_state_from_github(
    client: httpx.AsyncClient,
    *,
    owner: str,
    repo: str,
    token: str,
) -> dict | None:
    resp = await client.get(
        f"https://api.github.com/repos/{owner}/{repo}/contents/{_RACK_FILE}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
    )
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        return None
    payload = resp.json()
    encoded = payload.get("content")
    if not isinstance(encoded, str):
        return None
    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
        state = json.loads(decoded)
    except Exception:
        return None
    if not _is_valid_rack_state(state):
        return None
    return state


async def _set_repo_topics(client: httpx.AsyncClient, *, owner: str, repo: str, token: str, topics: list[str]) -> None:
    resp = await client.put(
        f"https://api.github.com/repos/{owner}/{repo}/topics",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
        json={"names": topics},
    )
    if resp.status_code not in (200, 201):
        detail = resp.json().get("message", "Failed to set repository topics")
        raise HTTPException(status_code=502, detail=detail)


def _ensure_local_repo(owner_login: str, repo_name: str, access_token: str) -> Path:
    workspace = _workspace()
    workspace.mkdir(parents=True, exist_ok=True)
    repo_path = _repo_path(owner_login, repo_name)
    remote_url = f"https://x-access-token:{access_token}@github.com/{owner_login}/{repo_name}.git"
    if not repo_path.exists():
        result = subprocess.run(
            ["git", "clone", remote_url, str(repo_path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Clone failed: {result.stderr or result.stdout}")
        return repo_path

    _run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
    branch_result = _run_git(repo_path, ["branch", "--show-current"], check=False)
    branch = branch_result.stdout.strip() or "main"
    _run_git(repo_path, ["pull", "--ff-only", "origin", branch], check=False)
    return repo_path


def _normalize_item(item: dict, rack_cols: int) -> dict:
    """Convert legacy item format (width_fraction) to col-based format."""
    if "position_col_start" in item and "position_col_count" in item:
        return item
    width_fraction = item.get("width_fraction", 1.0)
    if not isinstance(width_fraction, (int, float)):
        width_fraction = 1.0
    col_count = max(1, round(float(width_fraction) * rack_cols))
    col_count = min(col_count, rack_cols)
    return {
        **item,
        "position_col_start": 0,
        "position_col_count": col_count,
    }


@router.get("")
async def get_racks(session=Depends(get_current_session)):
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")

    async with httpx.AsyncClient() as client:
        repos_resp = await client.get(
            "https://api.github.com/user/repos",
            params={"per_page": 100, "affiliation": "owner", "sort": "updated"},
            headers={"Authorization": f"Bearer {session.access_token}"},
        )
        if repos_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch repositories from GitHub")

        racks: list[dict] = []
        for repo in repos_resp.json():
            repo_owner = repo.get("owner", {}).get("login")
            repo_name = repo.get("name")
            if not repo_owner or not repo_name:
                continue

            topics = await _fetch_repo_topics(
                client,
                owner=str(repo_owner),
                repo=str(repo_name),
                token=session.access_token,
            )
            if _RACK_TOPIC not in topics:
                continue

            state = await _fetch_rack_state_from_github(
                client,
                owner=str(repo_owner),
                repo=str(repo_name),
                token=session.access_token,
            )
            if not state:
                continue

            racks.append(_rack_summary_from_state(str(repo_name), state))

    racks.sort(key=lambda entry: (entry.get("created_at") or "", entry.get("id") or ""), reverse=True)
    return {"racks": racks}


@router.post("")
async def post_rack(body: CreateRackRequest, session=Depends(get_current_session)):
    _validate_width(body.rack_width_inches)
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")
    rack_name = body.name.strip()
    if not rack_name:
        raise HTTPException(status_code=400, detail="Rack name is required")

    rack_cols = body.rack_cols if body.rack_cols is not None else _COLS_BY_WIDTH[body.rack_width_inches]
    if rack_cols < 1 or rack_cols > 48:
        raise HTTPException(status_code=400, detail="rack_cols must be between 1 and 48")
    for rack_item in body.items:
        if rack_item.position_u_start + rack_item.position_u_height - 1 > body.rack_units:
            raise HTTPException(status_code=400, detail=f"Item {rack_item.id} exceeds rack height")
        _validate_item_cols(
            rack_cols,
            position_col_start=rack_item.position_col_start,
            position_col_count=rack_item.position_col_count,
        )
        _validate_item_network(has_no_ip=rack_item.has_no_ip, ip_value=rack_item.ip_address)

    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    base_name = _safe_slug(rack_name)
    repo_name = f"racksmith-{base_name}-{stamp}"
    gh_repo_resp: dict
    async with httpx.AsyncClient() as client:
        create_resp = await client.post(
            "https://api.github.com/user/repos",
            headers={"Authorization": f"Bearer {session.access_token}"},
            json={
                "name": repo_name,
                "private": True,
                "auto_init": True,
                "description": "Racksmith rack repository",
            },
        )
        if create_resp.status_code not in (200, 201):
            detail = create_resp.json().get("message", "Failed to create GitHub repository")
            raise HTTPException(status_code=502, detail=detail)
        gh_repo_resp = create_resp.json()

        await _set_repo_topics(
            client,
            owner=owner_login,
            repo=repo_name,
            token=session.access_token,
            topics=[_RACK_TOPIC],
        )

    repo_path = _ensure_local_repo(owner_login, repo_name, session.access_token)
    rack_state = {
        "kind": "racksmith/rack",
        "schema_version": 1,
        "meta": {
            "name": rack_name,
            "rack_width_inches": body.rack_width_inches,
            "rack_units": body.rack_units,
            "rack_cols": rack_cols,
            "owner_login": owner_login,
            "repository": gh_repo_resp.get("full_name"),
            "created_at": datetime.now(UTC).isoformat(),
        },
        "items": [
            {
                **rack_item.model_dump(),
                "ip_address": _validate_item_network(
                    has_no_ip=rack_item.has_no_ip,
                    ip_value=rack_item.ip_address,
                ),
                "name": rack_item.name.strip() if rack_item.name else None,
            }
            for rack_item in body.items
        ],
    }
    _save_rack_state(repo_path, rack_state)
    _commit_and_push(repo_path, "Initialize rack")
    return {"rack_id": repo_name}


@router.get("/{rack_id}")
async def get_rack_detail(rack_id: str, session=Depends(get_current_session)):
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")

    async with httpx.AsyncClient() as client:
        topics = await _fetch_repo_topics(
            client,
            owner=owner_login,
            repo=rack_id,
            token=session.access_token,
        )
        if _RACK_TOPIC not in topics:
            raise HTTPException(status_code=404, detail="Rack not found")

        state = await _fetch_rack_state_from_github(
            client,
            owner=owner_login,
            repo=rack_id,
            token=session.access_token,
        )
        if not state:
            raise HTTPException(status_code=404, detail="Rack config not found")

    meta = state.get("meta", {})
    rack_width = meta.get("rack_width_inches", 19)
    rack_cols = meta.get("rack_cols")
    if rack_cols is None or not isinstance(rack_cols, int):
        rack_cols = _COLS_BY_WIDTH.get(rack_width, 12)
    items = [
        _normalize_item(item, rack_cols)
        for item in state.get("items", [])
    ]
    return {
        "rack": {
            "id": rack_id,
            "owner_login": meta.get("owner_login"),
            "name": meta.get("name"),
            "rack_width_inches": rack_width,
            "rack_units": meta.get("rack_units"),
            "rack_cols": rack_cols,
            "created_at": meta.get("created_at"),
        },
        "items": items,
    }


@router.post("/{rack_id}/items")
async def post_rack_item(rack_id: str, body: CreateRackItemRequest, session=Depends(get_current_session)):
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")

    repo_path = _ensure_local_repo(owner_login, rack_id, session.access_token)
    state = _load_rack_state(repo_path)
    meta = state.get("meta", {})
    rack_units = int(meta.get("rack_units", 0))
    rack_cols = meta.get("rack_cols")
    if rack_cols is None or not isinstance(rack_cols, int):
        rack_cols = _COLS_BY_WIDTH.get(meta.get("rack_width_inches", 19), 12)
    if body.position_u_start + body.position_u_height - 1 > rack_units:
        raise HTTPException(status_code=400, detail="Item exceeds rack height")
    _validate_item_cols(
        rack_cols,
        position_col_start=body.position_col_start,
        position_col_count=body.position_col_count,
    )

    normalized_ip = _validate_item_network(has_no_ip=body.has_no_ip, ip_value=body.ip_address)
    item = body.model_dump()
    item["ip_address"] = normalized_ip
    item["name"] = body.name.strip() if body.name else None
    state.setdefault("items", []).append(item)
    _save_rack_state(repo_path, state)
    _commit_and_push(repo_path, "Add rack item")
    return {"status": "created", "item_id": body.id}


@router.patch("/{rack_id}/items/{item_id}")
async def patch_rack_item(
    rack_id: str,
    item_id: str,
    body: UpdateRackItemRequest,
    session=Depends(get_current_session),
):
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")

    repo_path = _ensure_local_repo(owner_login, rack_id, session.access_token)
    state = _load_rack_state(repo_path)
    meta = state.get("meta", {})
    rack_units = int(meta.get("rack_units", 0))
    rack_cols = meta.get("rack_cols")
    if rack_cols is None or not isinstance(rack_cols, int):
        rack_cols = _COLS_BY_WIDTH.get(meta.get("rack_width_inches", 19), 12)
    if body.position_u_start + body.position_u_height - 1 > rack_units:
        raise HTTPException(status_code=400, detail="Item exceeds rack height")
    _validate_item_cols(
        rack_cols,
        position_col_start=body.position_col_start,
        position_col_count=body.position_col_count,
    )

    normalized_ip = _validate_item_network(has_no_ip=body.has_no_ip, ip_value=body.ip_address)
    items = state.get("items", [])
    for idx, item in enumerate(items):
        if str(item.get("id")) != item_id:
            continue
        items[idx] = {
            **item,
            "position_u_start": body.position_u_start,
            "position_u_height": body.position_u_height,
            "position_col_start": body.position_col_start,
            "position_col_count": body.position_col_count,
            "has_no_ip": body.has_no_ip,
            "ip_address": normalized_ip,
            "name": body.name.strip() if body.name else None,
        }
        _save_rack_state(repo_path, state)
        _commit_and_push(repo_path, "Update rack item")
        return {"status": "updated"}

    raise HTTPException(status_code=404, detail="Item not found")


@router.delete("/{rack_id}/items/{item_id}")
async def remove_rack_item(rack_id: str, item_id: str, session=Depends(get_current_session)):
    owner_login = str(session.user.get("login") or "")
    if not owner_login:
        raise HTTPException(status_code=401, detail="Invalid session user")

    repo_path = _ensure_local_repo(owner_login, rack_id, session.access_token)
    state = _load_rack_state(repo_path)
    items = state.get("items", [])
    filtered = [item for item in items if str(item.get("id")) != item_id]
    if len(filtered) == len(items):
        raise HTTPException(status_code=404, detail="Item not found")
    state["items"] = filtered
    _save_rack_state(repo_path, state)
    _commit_and_push(repo_path, "Remove rack item")
    return {"status": "deleted"}
