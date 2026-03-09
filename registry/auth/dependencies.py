import hashlib
import time

import httpx
import structlog
from db.engine import get_db
from db.models import User
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

_token_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 60  # seconds


async def _verify_github_token(token: str) -> dict:
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()

    cached = _token_cache.get(key)
    if cached and now - cached[1] < _CACHE_TTL:
        return cached[0]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid GitHub token")

    data = resp.json()
    _token_cache[key] = (data, now)
    return data


async def _upsert_user(session: AsyncSession, gh_user: dict) -> User:
    result = await session.execute(select(User).where(User.github_id == gh_user["id"]))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            github_id=gh_user["id"],
            username=gh_user["login"],
            avatar_url=gh_user.get("avatar_url", ""),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info("created registry user", username=user.username)
    else:
        user.username = gh_user["login"]
        user.avatar_url = gh_user.get("avatar_url", "")
        await session.commit()

    return user


async def get_current_user(
    authorization: str = Header(...),
    session: AsyncSession = Depends(get_db),
) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    gh_user = await _verify_github_token(token)
    return await _upsert_user(session, gh_user)
