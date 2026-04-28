"""End-to-end integration tests for the auth flow.

These spin up a real Postgres via testcontainers and run the actual SQL
the routers emit. They are slower than the unit tests in test_auth.py
and require Docker on the test runner.
"""
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.user import User


async def test_register_creates_user_row(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "integ@example.com",
            "username": "integuser",
            "password": "validpass123",
        },
    )
    assert res.status_code == 201
    assert "access_token" in res.json()

    user = await db_session.scalar(select(User).where(User.email == "integ@example.com"))
    assert user is not None
    assert user.username == "integuser"
    assert user.is_verified is False
    assert user.is_active is True
    assert user.hashed_password.startswith("$2")  # bcrypt prefix


async def test_register_rejects_duplicate_email(
    integration_client: AsyncClient,
) -> None:
    body = {
        "email": "dup@example.com",
        "username": "dup1",
        "password": "validpass123",
    }
    first = await integration_client.post("/api/auth/register", json=body)
    assert first.status_code == 201

    second = await integration_client.post(
        "/api/auth/register",
        json={**body, "username": "dup2"},
    )
    assert second.status_code == 400
    assert "already registered" in second.json()["detail"].lower()


async def test_login_round_trip(integration_client: AsyncClient) -> None:
    await integration_client.post(
        "/api/auth/register",
        json={
            "email": "login@example.com",
            "username": "loginuser",
            "password": "validpass123",
        },
    )

    res = await integration_client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "validpass123"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]

    me = await integration_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["username"] == "loginuser"
