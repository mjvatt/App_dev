"""Integration tests for the public profile endpoint."""
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, username: str) -> None:
    res = await client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "validpass123"},
    )
    assert res.status_code == 201


async def test_profile_404_for_unknown_username(integration_client: AsyncClient) -> None:
    res = await integration_client.get("/api/profiles/ghost")
    assert res.status_code == 404


async def test_profile_returns_zeros_for_brand_new_user(
    integration_client: AsyncClient,
) -> None:
    await _register(integration_client, "newbie@example.com", "newbie")
    integration_client.cookies.clear()  # public endpoint shouldn't need auth

    res = await integration_client.get("/api/profiles/newbie")
    assert res.status_code == 200
    body = res.json()
    assert body["username"] == "newbie"
    assert body["level"] == 1
    assert body["total_xp"] == 0
    assert body["streak_days"] == 0
    assert body["daily_streak_days"] == 0
    assert body["longest_streak"] == 0
    assert body["longest_daily_streak"] == 0
    assert body["challenges_passed"] == 0
    assert body["topics"] == {}


async def test_profile_does_not_require_auth(integration_client: AsyncClient) -> None:
    """Public profiles must be readable by signed-out viewers — they're
    the share surface for streak runs and ranks."""
    await _register(integration_client, "shared@example.com", "sharedlink")
    integration_client.cookies.clear()
    res = await integration_client.get("/api/profiles/sharedlink")
    assert res.status_code == 200
