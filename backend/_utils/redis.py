"""Redis client helper with standard key-value operations."""

from __future__ import annotations

import redis

import settings


class Redis:
    """Thin wrapper around redis-py with useful standard public methods."""

    _client: redis.Redis | None = None

    @classmethod
    def _get_client(cls) -> redis.Redis:
        if cls._client is None:
            cls._client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
            )
        return cls._client

    @classmethod
    def get(cls, key: str) -> str | None:
        """Get value for key. Returns None if key does not exist."""
        return cls._get_client().get(key)

    @classmethod
    def set(cls, key: str, value: str) -> None:
        """Set key to value (no expiry)."""
        cls._get_client().set(key, value)

    @classmethod
    def setex(cls, key: str, ttl_seconds: int, value: str) -> None:
        """Set key to value with TTL in seconds."""
        cls._get_client().setex(key, ttl_seconds, value)

    @classmethod
    def delete(cls, key: str) -> None:
        """Delete key. Ignored if key does not exist."""
        cls._get_client().delete(key)

    @classmethod
    def sadd(cls, key: str, *members: str) -> int:
        """Add members to a set. Returns number of new members added."""
        return cls._get_client().sadd(key, *members)

    @classmethod
    def smembers(cls, key: str) -> set[str]:
        """Return all members of a set."""
        return cls._get_client().smembers(key)

    @classmethod
    def srem(cls, key: str, *members: str) -> int:
        """Remove members from a set. Returns number removed."""
        return cls._get_client().srem(key, *members)

    @classmethod
    def zadd(cls, key: str, mapping: dict[str, float]) -> int:
        """Add members with scores to a sorted set."""
        return cls._get_client().zadd(key, mapping)

    @classmethod
    def zrevrange(cls, key: str, start: int, stop: int) -> list[str]:
        """Return sorted-set members in descending score order."""
        return cls._get_client().zrevrange(key, start, stop)

    @classmethod
    def expire(cls, key: str, ttl_seconds: int) -> bool:
        """Set a TTL on a key."""
        return cls._get_client().expire(key, ttl_seconds)

    @classmethod
    def rpush(cls, key: str, *values: str) -> int:
        """Append values to the tail of a list."""
        return cls._get_client().rpush(key, *values)

    @classmethod
    def lrange(cls, key: str, start: int, stop: int) -> list[str]:
        """Return a slice from a list."""
        return cls._get_client().lrange(key, start, stop)
