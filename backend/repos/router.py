"""Repos router: list user repos, clone to server."""

import shutil
import subprocess
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import settings
from auth.session import get_current_session

router = APIRouter()


class CloneRequest(BaseModel):
    owner: str
    repo: str


@router.get("")
async def list_repos(session=Depends(get_current_session)):
    """List repositories the user has access to."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            params={"per_page": 100, "type": "all"},
            headers={"Authorization": f"Bearer {session.access_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch repos from GitHub")

    repos = resp.json()
    return {
        "repos": [
            {
                "id": r["id"],
                "full_name": r["full_name"],
                "name": r["name"],
                "owner": r["owner"]["login"],
                "clone_url": r["clone_url"],
                "private": r.get("private", False),
            }
            for r in repos
        ]
    }


@router.post("/clone")
async def clone_repo(
    body: CloneRequest,
    session=Depends(get_current_session),
):
    """Clone a repository to the workspace."""
    owner = body.owner
    repo = body.repo

    workspace = Path(settings.REPOS_WORKSPACE)
    workspace.mkdir(parents=True, exist_ok=True)
    target_name = f"{owner}_{repo}"
    target_path = workspace / target_name

    if target_path.exists():
        shutil.rmtree(target_path)

    clone_url = f"https://x-access-token:{session.access_token}@github.com/{owner}/{repo}.git"

    result = subprocess.run(
        ["git", "clone", "--depth", "1", clone_url, str(target_path)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"Clone failed: {result.stderr or result.stdout}",
        )

    return {"path": str(target_path), "status": "cloned"}
