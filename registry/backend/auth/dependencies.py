import hashlib
import time
from collections import OrderedDict

import httpx
import structlog
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.engine import get_db
from db.models import User

logger = structlog.get_logger()

_CACHE_TTL = 3600  # 1 hour — GH tokens don't change during a session
_CACHE_MAX_SIZE = 2048


class _BoundedTTLCache:
    """Simple bounded cache with TTL eviction and max-size cap."""

    def __init__(self, maxsize: int, ttl: float) -> None:
        self._store: OrderedDict[str, tuple[dict, float]] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl

    def get(self, key: str) -> dict | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        data, ts = entry
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return data

    def put(self, key: str, data: dict) -> None:
        if key in self._store:
            del self._store[key]
        elif len(self._store) >= self._maxsize:
            self._store.popitem(last=False)
        self._store[key] = (data, time.monotonic())


_token_cache = _BoundedTTLCache(maxsize=_CACHE_MAX_SIZE, ttl=_CACHE_TTL)


async def _verify_github_token(token: str) -> dict:
    key = hashlib.sha256(token.encode()).hexdigest()

    cached = _token_cache.get(key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid GitHub token")

    data = resp.json()
    _token_cache.put(key, data)
    return data


async def _upsert_user(session: AsyncSession, gh_user: dict) -> User:
    result = await session.execute(select(User).where(User.github_id == gh_user["id"]))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            github_id=gh_user["id"],
            username=gh_user["login"],
            avatar_url=gh_user.get("avatar_url", ""),
            last_seen=func.now(),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info("created registry user", username=user.username)
    else:
        user.username = gh_user["login"]
        user.avatar_url = gh_user.get("avatar_url", "")
        user.last_seen = func.now()
        await session.commit()

    return user


async def get_current_user(
    authorization: str = Header(...),
    session: AsyncSession = Depends(get_db),
) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    gh_user = await _verify_github_token(token)
    return await _upsert_user(session, gh_user)
