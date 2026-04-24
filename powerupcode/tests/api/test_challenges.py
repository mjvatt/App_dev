import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_next_challenge_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/challenges/next")
    assert res.status_code == 403


async def test_submit_attempt_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/api/challenges/stub-001/attempt", json={"solution": "pass"})
    assert res.status_code == 403


async def test_hint_requires_auth(client: AsyncClient) -> None:
    res = await client.post(
        "/api/challenges/stub-001/hint", json={"current_attempt": "pass"}
    )
    assert res.status_code == 403
