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


async def test_unverified_user_blocked_from_submit_attempt(
    integration_client: AsyncClient,
) -> None:
    reg = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "unverified@example.com",
            "username": "unverified",
            "password": "validpass123",
        },
    )
    token = reg.json()["access_token"]

    res = await integration_client.post(
        "/api/challenges/stub-001/attempt",
        json={"solution": "pass", "time_ms": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "email_verification_required"


async def test_unverified_user_blocked_from_billing_checkout(
    integration_client: AsyncClient,
) -> None:
    reg = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "unverified2@example.com",
            "username": "unverified2",
            "password": "validpass123",
        },
    )
    token = reg.json()["access_token"]

    res = await integration_client.post(
        "/api/billing/checkout",
        json={
            "plan": "monthly",
            "success_url": "http://x/s",
            "cancel_url": "http://x/c",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "email_verification_required"


async def test_verified_user_passes_gate(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    reg = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "verified@example.com",
            "username": "verifiedu",
            "password": "validpass123",
        },
    )
    token = reg.json()["access_token"]

    # Flip the verification flag the way our verify-email POST handler would.
    user = await db_session.scalar(
        select(User).where(User.email == "verified@example.com")
    )
    assert user is not None
    user.is_verified = True
    await db_session.commit()

    res = await integration_client.post(
        "/api/challenges/stub-001/attempt",
        json={"solution": "pass", "time_ms": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200


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


async def test_register_sets_auth_cookies(integration_client: AsyncClient) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "cookie@example.com",
            "username": "cookieu",
            "password": "validpass123",
        },
    )
    assert res.status_code == 201
    assert "puc_access" in res.cookies
    assert "puc_refresh" in res.cookies
    # Cookies alone (no Authorization header) should authenticate.
    me = await integration_client.get("/api/auth/me")
    assert me.status_code == 200


async def test_refresh_rotates_and_invalidates_old_token(
    integration_client: AsyncClient,
) -> None:
    await integration_client.post(
        "/api/auth/register",
        json={
            "email": "rot@example.com",
            "username": "rotuser",
            "password": "validpass123",
        },
    )
    old_refresh = integration_client.cookies.get("puc_refresh")
    assert old_refresh is not None

    res = await integration_client.post("/api/auth/refresh")
    assert res.status_code == 200
    new_refresh = integration_client.cookies.get("puc_refresh")
    assert new_refresh != old_refresh

    # Replaying the old refresh token must fail.
    replay = await integration_client.post(
        "/api/auth/refresh", cookies={"puc_refresh": old_refresh}
    )
    assert replay.status_code == 401


async def test_logout_revokes_session(integration_client: AsyncClient) -> None:
    await integration_client.post(
        "/api/auth/register",
        json={
            "email": "logout@example.com",
            "username": "logoutu",
            "password": "validpass123",
        },
    )
    refresh_before = integration_client.cookies.get("puc_refresh")

    out = await integration_client.post("/api/auth/logout")
    assert out.status_code == 200

    # Even if a stale refresh token surfaces, logout revoked it server-side.
    replay = await integration_client.post(
        "/api/auth/refresh", cookies={"puc_refresh": refresh_before}
    )
    assert replay.status_code == 401


async def test_password_reset_revokes_all_sessions(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    from api.models.user import EmailToken

    await integration_client.post(
        "/api/auth/register",
        json={
            "email": "reset@example.com",
            "username": "resetuser",
            "password": "validpass123",
        },
    )
    refresh_before = integration_client.cookies.get("puc_refresh")
    assert refresh_before is not None

    # Mint a reset token directly (forgot-password is rate-limited and we
    # only need the side effect under test).
    user = await db_session.scalar(
        select(__import__("api.models.user", fromlist=["User"]).User).where(
            __import__("api.models.user", fromlist=["User"]).User.email
            == "reset@example.com"
        )
    )
    assert user is not None
    from datetime import UTC, datetime, timedelta

    reset_row = EmailToken(
        user_id=user.id,
        token_type="reset",
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    db_session.add(reset_row)
    await db_session.commit()

    res = await integration_client.post(
        "/api/auth/reset-password",
        json={"token": reset_row.token, "new_password": "newpass123"},
    )
    assert res.status_code == 200

    # The original refresh token should no longer rotate.
    replay = await integration_client.post(
        "/api/auth/refresh", cookies={"puc_refresh": refresh_before}
    )
    assert replay.status_code == 401
