"""Integration tests for invite-only registration.

These spin up a real Postgres via testcontainers and exercise the atomic
redemption UPDATE on the invite_codes table.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.models.user import InviteCode, User


@pytest.fixture
def invite_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "invite_only_registration", True)


async def _seed_code(
    db_session: AsyncSession, code: str, *, max_uses: int = 1
) -> None:
    db_session.add(InviteCode(code=code, max_uses=max_uses, uses=0))
    await db_session.commit()


async def test_register_rejected_when_gate_on_and_no_code(
    invite_only: None, integration_client: AsyncClient
) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "a@example.com",
            "username": "alice",
            "password": "validpass123",
        },
    )
    assert res.status_code == 400
    assert "invite" in res.json()["detail"].lower()


async def test_register_rejected_when_gate_on_and_code_unknown(
    invite_only: None, integration_client: AsyncClient
) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "b@example.com",
            "username": "bob",
            "password": "validpass123",
            "invite_code": "NEVER-EXISTED",
        },
    )
    assert res.status_code == 400


async def test_register_rejected_when_code_format_invalid(
    invite_only: None, integration_client: AsyncClient
) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "c@example.com",
            "username": "carol",
            "password": "validpass123",
            "invite_code": "bad code with spaces!",
        },
    )
    assert res.status_code == 400


async def test_register_succeeds_with_valid_code_and_increments_uses(
    invite_only: None,
    integration_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _seed_code(db_session, "GOLDEN-TICKET")

    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "d@example.com",
            "username": "dave",
            "password": "validpass123",
            "invite_code": "golden-ticket",
        },
    )
    assert res.status_code == 201

    row = await db_session.get(InviteCode, "GOLDEN-TICKET")
    assert row is not None
    assert row.uses == 1


async def test_single_use_code_cannot_be_redeemed_twice(
    invite_only: None,
    integration_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _seed_code(db_session, "ONESHOT", max_uses=1)

    first = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "e1@example.com",
            "username": "eve1",
            "password": "validpass123",
            "invite_code": "ONESHOT",
        },
    )
    assert first.status_code == 201

    second = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "e2@example.com",
            "username": "eve2",
            "password": "validpass123",
            "invite_code": "ONESHOT",
        },
    )
    assert second.status_code == 400


async def test_multi_use_code_can_be_redeemed_up_to_max_uses(
    invite_only: None,
    integration_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _seed_code(db_session, "BATCH-2", max_uses=2)

    for i in range(2):
        res = await integration_client.post(
            "/api/auth/register",
            json={
                "email": f"f{i}@example.com",
                "username": f"frank{i}",
                "password": "validpass123",
                "invite_code": "BATCH-2",
            },
        )
        assert res.status_code == 201, res.text

    third = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "f2@example.com",
            "username": "frank2",
            "password": "validpass123",
            "invite_code": "BATCH-2",
        },
    )
    assert third.status_code == 400

    row = await db_session.get(InviteCode, "BATCH-2")
    assert row is not None
    assert row.uses == 2


async def test_failed_uniqueness_check_does_not_burn_invite_use(
    invite_only: None,
    integration_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    # max_uses=2 so the second attempt's UPDATE matches; the failure
    # must come from the duplicate-email check downstream, exercising
    # the implicit rollback when get_db's session context closes.
    await _seed_code(db_session, "PROTECTED", max_uses=2)

    first = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "g@example.com",
            "username": "grace",
            "password": "validpass123",
            "invite_code": "PROTECTED",
        },
    )
    assert first.status_code == 201

    duplicate = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "g@example.com",  # same email triggers uniqueness failure
            "username": "grace2",
            "password": "validpass123",
            "invite_code": "PROTECTED",
        },
    )
    assert duplicate.status_code == 400
    assert "already registered" in duplicate.json()["detail"].lower()

    await db_session.expire_all()
    row = await db_session.get(InviteCode, "PROTECTED")
    assert row is not None
    assert row.uses == 1, "second UPDATE must roll back when downstream check fails"


async def test_invite_code_field_ignored_when_gate_off(
    integration_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    res = await integration_client.post(
        "/api/auth/register",
        json={
            "email": "h@example.com",
            "username": "hank",
            "password": "validpass123",
            "invite_code": "anything-goes",
        },
    )
    assert res.status_code == 201
    user = await db_session.scalar(select(User).where(User.email == "h@example.com"))
    assert user is not None
