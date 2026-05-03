"""Integration tests for the friend-to-friend token gift endpoint."""
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _register_and_verify(
    client: AsyncClient, db_session: AsyncSession, email: str, username: str
) -> str:
    res = await client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "validpass123"},
    )
    assert res.status_code == 201
    user_id = (
        await db_session.execute(
            text("SELECT id FROM users WHERE username = :u"), {"u": username}
        )
    ).scalar_one()
    # Skip the email-verification round-trip; gift_tokens uses
    # require_verified_user, so flip the flag directly.
    await db_session.execute(
        text("UPDATE users SET is_verified = TRUE WHERE id = :id"), {"id": user_id}
    )
    await db_session.commit()
    return user_id


async def _login(client: AsyncClient, email: str) -> None:
    client.cookies.clear()
    res = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "validpass123"},
    )
    assert res.status_code == 200


async def _seed_tokens(db_session: AsyncSession, user_id: str, balance: int) -> None:
    await db_session.execute(
        text(
            "INSERT INTO user_progress (user_id, total_xp, level, streak_days, "
            "daily_streak_days, token_balance, streak_shields, longest_streak, "
            "longest_daily_streak, topics) "
            "VALUES (:id, 0, 1, 0, 0, :b, 0, 0, 0, '{}'::json) "
            "ON CONFLICT (user_id) DO UPDATE SET token_balance = :b"
        ),
        {"id": user_id, "b": balance},
    )
    await db_session.commit()


async def _accept_friendship(
    client: AsyncClient,
    sender_email: str,
    recipient_email: str,
    recipient_username: str,
) -> None:
    await _login(client, sender_email)
    await client.post("/api/friends/request", json={"username": recipient_username})
    await _login(client, recipient_email)
    reqs = (await client.get("/api/friends/requests")).json()
    fid = reqs["incoming"][0]["friendship_id"]
    await client.post(f"/api/friends/{fid}/accept")


async def test_gift_round_trip_transfers_balance(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    alice_id = await _register_and_verify(
        integration_client, db_session, "alice@example.com", "alice"
    )
    bob_id = await _register_and_verify(
        integration_client, db_session, "bob@example.com", "bob"
    )
    await _seed_tokens(db_session, alice_id, 30)
    await _seed_tokens(db_session, bob_id, 5)
    await _accept_friendship(
        integration_client, "alice@example.com", "bob@example.com", "bob"
    )

    await _login(integration_client, "alice@example.com")
    res = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "bob", "amount": 10},
    )
    assert res.status_code == 200
    body: dict[str, Any] = res.json()
    assert body["recipient_username"] == "bob"
    assert body["amount"] == 10
    assert body["sender_token_balance"] == 20

    # Bob's balance should reflect the inbound gift.
    bobs_balance = (
        await db_session.execute(
            text("SELECT token_balance FROM user_progress WHERE user_id = :id"),
            {"id": bob_id},
        )
    ).scalar_one()
    assert bobs_balance == 15


async def test_gift_to_non_friend_is_forbidden(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    sender_id = await _register_and_verify(
        integration_client, db_session, "carol@example.com", "carol"
    )
    await _register_and_verify(
        integration_client, db_session, "dave@example.com", "dave"
    )
    await _seed_tokens(db_session, sender_id, 30)

    await _login(integration_client, "carol@example.com")
    res = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "dave", "amount": 5},
    )
    assert res.status_code == 403
    assert "friend" in res.json()["detail"].lower()


async def test_gift_to_self_is_rejected(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    sender_id = await _register_and_verify(
        integration_client, db_session, "eve@example.com", "eveone"
    )
    await _seed_tokens(db_session, sender_id, 30)

    await _login(integration_client, "eve@example.com")
    res = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "eveone", "amount": 5},
    )
    assert res.status_code == 400
    assert "yourself" in res.json()["detail"].lower()


async def test_gift_with_insufficient_balance_402(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    sender_id = await _register_and_verify(
        integration_client, db_session, "frank@example.com", "frank1"
    )
    await _register_and_verify(
        integration_client, db_session, "gina@example.com", "gina1"
    )
    await _seed_tokens(db_session, sender_id, 2)
    await _accept_friendship(
        integration_client, "frank@example.com", "gina@example.com", "gina1"
    )

    await _login(integration_client, "frank@example.com")
    res = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "gina1", "amount": 10},
    )
    assert res.status_code == 402


async def test_gift_amount_out_of_range_rejected(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    sender_id = await _register_and_verify(
        integration_client, db_session, "henry@example.com", "henry1"
    )
    await _register_and_verify(
        integration_client, db_session, "ivy@example.com", "ivyone"
    )
    await _seed_tokens(db_session, sender_id, 100)
    await _accept_friendship(
        integration_client, "henry@example.com", "ivy@example.com", "ivyone"
    )

    await _login(integration_client, "henry@example.com")
    too_big = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "ivyone", "amount": 999},
    )
    assert too_big.status_code == 400

    too_small = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "ivyone", "amount": 0},
    )
    assert too_small.status_code == 400


async def test_gift_daily_cap_to_same_recipient(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    sender_id = await _register_and_verify(
        integration_client, db_session, "jack@example.com", "jacky1"
    )
    await _register_and_verify(
        integration_client, db_session, "kate@example.com", "katey1"
    )
    await _seed_tokens(db_session, sender_id, 50)
    await _accept_friendship(
        integration_client, "jack@example.com", "kate@example.com", "katey1"
    )

    await _login(integration_client, "jack@example.com")
    first = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "katey1", "amount": 5},
    )
    assert first.status_code == 200

    second = await integration_client.post(
        "/api/progress/gift-tokens",
        json={"recipient_username": "katey1", "amount": 3},
    )
    assert second.status_code == 429
