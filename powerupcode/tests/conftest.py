import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/powerupcode_test")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENGINE_MODULE", "stub")

from api.main import app  # noqa: E402 — env must be set before import


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
