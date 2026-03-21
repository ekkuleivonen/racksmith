"""Redis client helper with standard key-value operations."""

from __future__ import annotations

import builtins
from typing import cast

import redis
import redis.asyncio as aioredis

from racksmith_shared import settings_base


class Redis:
    """Thin wrapper around redis-py with useful standard public methods."""

    _client: redis.Redis | None = None

    @classmethod
    def _get_client(cls) -> redis.Redis:
        if cls._client is None:
            cls._client = redis.from_url(
                settings_base.REDIS_URL,
                decode_responses=True,
            )
        return cls._client

    @classmethod
    def get(cls, key: str) -> str | None:
        return cast("str | None", cls._get_client().get(key))

    @classmethod
    def set(cls, key: str, value: str) -> None:
        cls._get_client().set(key, value)

    @classmethod
    def setex(cls, key: str, ttl_seconds: int, value: str) -> None:
        cls._get_client().setex(key, ttl_seconds, value)

    @classmethod
    def delete(cls, key: str) -> None:
        cls._get_client().delete(key)

    @classmethod
    def sadd(cls, key: str, *members: str) -> int:
        return cast(int, cls._get_client().sadd(key, *members))

    @classmethod
    def smembers(cls, key: str) -> builtins.set[str]:
        return cast("builtins.set[str]", cls._get_client().smembers(key))

    @classmethod
    def srem(cls, key: str, *members: str) -> int:
        return cast(int, cls._get_client().srem(key, *members))

    @classmethod
    def zadd(cls, key: str, mapping: dict[str, float]) -> int:
        return cast(int, cls._get_client().zadd(key, mapping))

    @classmethod
    def zrevrange(cls, key: str, start: int, stop: int) -> list[str]:
        return cast("list[str]", cls._get_client().zrevrange(key, start, stop))

    @classmethod
    def expire(cls, key: str, ttl_seconds: int) -> bool:
        return cast(bool, cls._get_client().expire(key, ttl_seconds))

    @classmethod
    def rpush(cls, key: str, *values: str) -> int:
        return cast(int, cls._get_client().rpush(key, *values))

    @classmethod
    def lrange(cls, key: str, start: int, stop: int) -> list[str]:
        return cast("list[str]", cls._get_client().lrange(key, start, stop))

    @classmethod
    def hset_mapping(cls, key: str, mapping: dict[str, str]) -> None:
        cls._get_client().hset(key, mapping=mapping)

    @classmethod
    def hgetall(cls, key: str) -> dict[str, str]:
        return cast("dict[str, str]", cls._get_client().hgetall(key))


class AsyncRedis:
    """Async wrapper around redis.asyncio for use in FastAPI route handlers."""

    _client: aioredis.Redis | None = None

    @classmethod
    def _get_client(cls) -> aioredis.Redis:
        if cls._client is None:
            cls._client = aioredis.from_url(
                settings_base.REDIS_URL,
                decode_responses=True,
            )
        return cls._client

    @classmethod
    async def get(cls, key: str) -> str | None:
        return await cls._get_client().get(key)

    @classmethod
    async def set(cls, key: str, value: str) -> None:
        await cls._get_client().set(key, value)

    @classmethod
    async def setex(cls, key: str, ttl_seconds: int, value: str) -> None:
        await cls._get_client().setex(key, ttl_seconds, value)

    @classmethod
    async def delete(cls, key: str) -> int:
        return int(await cls._get_client().delete(key))

    @classmethod
    async def sadd(cls, key: str, *members: str) -> int:
        result = await cls._get_client().sadd(key, *members)  # type: ignore[misc]
        return int(result)

    @classmethod
    async def smembers(cls, key: str) -> builtins.set[str]:
        result = await cls._get_client().smembers(key)  # type: ignore[misc]
        return set(result)

    @classmethod
    async def srem(cls, key: str, *members: str) -> int:
        result = await cls._get_client().srem(key, *members)  # type: ignore[misc]
        return int(result)

    @classmethod
    async def zadd(cls, key: str, mapping: dict[str, float]) -> int:
        result = await cls._get_client().zadd(key, mapping)
        return int(result)

    @classmethod
    async def zrevrange(cls, key: str, start: int, stop: int) -> list[str]:
        result = await cls._get_client().zrevrange(key, start, stop)
        return list(result)

    @classmethod
    async def expire(cls, key: str, ttl_seconds: int) -> bool:
        result = await cls._get_client().expire(key, ttl_seconds)
        return bool(result)

    @classmethod
    async def rpush(cls, key: str, *values: str) -> int:
        result = await cls._get_client().rpush(key, *values)  # type: ignore[misc]
        return int(result)

    @classmethod
    async def lrange(cls, key: str, start: int, stop: int) -> list[str]:
        result = await cls._get_client().lrange(key, start, stop)  # type: ignore[misc]
        return list(result)

    @classmethod
    async def hset_mapping(cls, key: str, mapping: dict[str, str]) -> None:
        await cls._get_client().hset(key, mapping=mapping)  # type: ignore[misc]

    @classmethod
    async def hgetall(cls, key: str) -> dict[str, str]:
        result = await cls._get_client().hgetall(key)  # type: ignore[misc]
        return dict(result)
