import os
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

# Defaults for test runs that don't need a real DB. DB-backed fixtures
# override DATABASE_URL with the testcontainers URL before any test runs.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/powerupcode_test")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENGINE_MODULE", "stub")
os.environ.setdefault("ENV", "test")

from api.main import app  # noqa: E402 — env must be set before import


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# DB-backed integration fixtures
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent


def _to_async_url(sync_url: str) -> str:
    if "+psycopg2" in sync_url:
        return sync_url.replace("+psycopg2", "+asyncpg")
    return sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)


@pytest.fixture(scope="session")
def pg_url() -> Iterator[str]:
    """Boot Postgres 16 once per session and apply Alembic migrations.
    Yields the asyncpg DSN. Run via the alembic Python API (not a
    subprocess) so the local alembic/ migrations folder doesn't
    shadow the package."""
    container = PostgresContainer("postgres:16-alpine")
    container.start()
    try:
        async_url = _to_async_url(container.get_connection_url())
        os.environ["DATABASE_URL"] = async_url

        from alembic.config import Config as AlembicConfig

        from alembic import command

        cfg = AlembicConfig(str(REPO_ROOT / "alembic.ini"))
        command.upgrade(cfg, "head")

        yield async_url
    finally:
        container.stop()


@pytest.fixture
async def db_engine(pg_url: str) -> AsyncGenerator[AsyncEngine]:
    """Function-scoped so each test gets an engine bound to its own asyncio
    loop. The Postgres container is session-scoped because spinning it up
    per test is too slow; the engine is cheap to recreate.

    Wipes user-mutable tables between tests so test order does not matter."""
    engine = create_async_engine(pg_url, echo=False)
    try:
        # Truncate before each test so per-test data is isolated. Order
        # matters: child tables before parents (FK constraints).
        from sqlalchemy import text

        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE TABLE attempts, user_progress, email_tokens, "
                    "subscriptions, processed_stripe_events, sessions, "
                    "review_schedule, daily_challenges, friendships, "
                    "proposed_challenges, challenges, users "
                    "RESTART IDENTITY CASCADE"
                )
            )
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    async with Session() as session:
        yield session


@pytest.fixture
async def integration_client(
    db_engine: AsyncEngine,
) -> AsyncGenerator[AsyncClient]:
    """An httpx client bound to the FastAPI app, with get_db overridden so
    every request uses the testcontainers Postgres."""
    from api.dependencies import get_db

    Session = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override() -> AsyncGenerator[AsyncSession]:
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)
