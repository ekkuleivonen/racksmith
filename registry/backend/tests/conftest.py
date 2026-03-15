"""Registry backend test fixtures.

Requires a running PostgreSQL instance. Configure via DATABASE_URL env var
or use the default (registry_test database on localhost).

Create the test database once:
    psql -U registry -h localhost -c "CREATE DATABASE registry_test;"
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass

os.environ.setdefault(
    "TOKEN_ENCRYPTION_KEY",
    "o-UPWlE_KIGLn-crg-PIe5BNfKCS9qUOCJksxzuEByE=",
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://registry:registry@localhost:5432/registry_test",
)

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import settings
from db.models import Base, User


def _can_connect() -> bool:
    """Synchronous check whether the test database is reachable."""
    async def _probe():
        eng = create_async_engine(settings.DATABASE_URL, echo=False)
        try:
            async with eng.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False
        finally:
            await eng.dispose()

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return False
        return loop.run_until_complete(_probe())
    except RuntimeError:
        return asyncio.run(_probe())


_DB_AVAILABLE = _can_connect()


@pytest_asyncio.fixture(scope="function")
async def engine():
    if not _DB_AVAILABLE:
        pytest.skip(f"PostgreSQL not reachable at {settings.DATABASE_URL}")
    eng = create_async_engine(settings.DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    """Per-test async session."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@dataclass
class SeedData:
    user: User
    other_user: User


@pytest_asyncio.fixture
async def seed(db: AsyncSession) -> SeedData:
    """Seed minimal required data: two users."""
    user = User(
        github_id=1,
        username="alice",
        avatar_url="https://example.com/alice.png",
        access_level="user",
    )
    other_user = User(
        github_id=2,
        username="bob",
        avatar_url="https://example.com/bob.png",
        access_level="user",
    )
    db.add_all([user, other_user])
    await db.commit()

    return SeedData(
        user=user,
        other_user=other_user,
    )
