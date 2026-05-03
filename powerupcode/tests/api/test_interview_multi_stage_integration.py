"""Integration tests for the multi-stage Mock Interview flow.

The stub engine returns a single in-memory challenge ('stub-001') for
every next_challenge call regardless of (topic, difficulty), and uses
the default GameEngine.generate_interview_post_mortem which returns an
'unavailable' grade with overall_score=0. Tests assert the *structure*
of multi-stage transitions, not the grading payload.
"""
import json

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
    await db_session.execute(
        text("UPDATE users SET is_verified = TRUE WHERE id = :id"), {"id": user_id}
    )
    await db_session.commit()
    return user_id


async def _seed_stub_challenge(db_session: AsyncSession) -> None:
    """The stub engine returns id='stub-001' for every next_challenge call.
    Multi-stage response building reads back through ChallengeRepository,
    so the row must exist in the bank or the response 404s."""
    await db_session.execute(
        text(
            "INSERT INTO challenges (id, topic, difficulty, title, prompt, "
            "constraints, examples, source) VALUES "
            "(:id, :topic, :diff, :title, :prompt, :cons, :ex, :src) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {
            "id": "stub-001",
            "topic": "arrays",
            "diff": "easy",
            "title": "Two Sum",
            "prompt": "Stub prompt for tests.",
            "cons": json.dumps(["n <= 10^4"]),
            "ex": json.dumps([{"input": "x", "output": "y"}]),
            "src": "seed",
        },
    )
    await db_session.commit()


async def _login(client: AsyncClient, email: str) -> None:
    client.cookies.clear()
    res = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "validpass123"},
    )
    assert res.status_code == 200


async def test_multi_stage_start_creates_three_stages(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(integration_client, db_session, "alice@example.com", "alicemulti")
    await _seed_stub_challenge(db_session)
    await _login(integration_client, "alice@example.com")

    res = await integration_client.post(
        "/api/interviews/start",
        json={"multi_stage": True, "topic": "arrays", "difficulty": "medium"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_multi_stage"] is True
    assert body["current_stage_index"] == 0
    assert body["status"] == "in_progress"
    assert len(body["stages"]) == 3
    assert [s["label"] for s in body["stages"]] == ["warmup", "main", "follow_up"]
    assert body["stages"][0]["status"] == "in_progress"
    assert body["stages"][1]["status"] == "pending"
    assert body["stages"][2]["status"] == "pending"


async def test_advance_progresses_through_stages_and_finalizes(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(integration_client, db_session, "bob@example.com", "bobmulti")
    await _seed_stub_challenge(db_session)
    await _login(integration_client, "bob@example.com")

    start = await integration_client.post(
        "/api/interviews/start",
        json={"multi_stage": True, "topic": "arrays", "difficulty": "easy"},
    )
    session_id = start.json()["id"]

    payload = {"solution": "pass\n", "transcript": "talk", "language": "python", "time_ms": 60_000}

    # Advance from warmup -> main
    r1 = await integration_client.post(
        f"/api/interviews/{session_id}/advance", json=payload
    )
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["status"] == "in_progress"
    assert b1["current_stage_index"] == 1
    assert b1["stages"][0]["status"] == "completed"
    assert b1["stages"][1]["status"] == "in_progress"
    assert b1["stages"][2]["status"] == "pending"

    # Advance from main -> follow-up
    r2 = await integration_client.post(
        f"/api/interviews/{session_id}/advance", json=payload
    )
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["status"] == "in_progress"
    assert b2["current_stage_index"] == 2
    assert b2["stages"][1]["status"] == "completed"
    assert b2["stages"][2]["status"] == "in_progress"

    # Final advance -> completed + aggregated
    r3 = await integration_client.post(
        f"/api/interviews/{session_id}/advance", json=payload
    )
    assert r3.status_code == 200
    b3 = r3.json()
    assert b3["status"] == "completed"
    assert b3["overall_score"] is not None
    assert b3["time_ms"] is not None  # sum of per-stage times
    assert all(s["status"] == "completed" for s in b3["stages"])

    # A fourth advance after finalization is a 409.
    r4 = await integration_client.post(
        f"/api/interviews/{session_id}/advance", json=payload
    )
    assert r4.status_code == 409


async def test_advance_rejected_on_single_stage_session(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(integration_client, db_session, "carol@example.com", "carolmulti")
    await _seed_stub_challenge(db_session)
    await _login(integration_client, "carol@example.com")

    start = await integration_client.post(
        "/api/interviews/start", json={"topic": "arrays", "difficulty": "easy"}
    )
    assert start.status_code == 200
    assert start.json()["is_multi_stage"] is False
    session_id = start.json()["id"]

    res = await integration_client.post(
        f"/api/interviews/{session_id}/advance",
        json={"solution": "x", "transcript": "", "language": "python", "time_ms": 0},
    )
    assert res.status_code == 400


async def test_end_abandons_multi_stage_run(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(integration_client, db_session, "dave@example.com", "davemulti")
    await _seed_stub_challenge(db_session)
    await _login(integration_client, "dave@example.com")

    start = await integration_client.post(
        "/api/interviews/start",
        json={"multi_stage": True, "topic": "arrays", "difficulty": "medium"},
    )
    session_id = start.json()["id"]

    end = await integration_client.post(
        f"/api/interviews/{session_id}/end",
        json={"solution": "x", "transcript": "", "language": "python", "time_ms": 0},
    )
    assert end.status_code == 200
    body = end.json()
    assert body["status"] == "abandoned"
    # The stage that was active should also be marked abandoned.
    assert body["stages"][0]["status"] == "abandoned"

    # Subsequent advance is rejected because the run is no longer in_progress.
    bad = await integration_client.post(
        f"/api/interviews/{session_id}/advance",
        json={"solution": "x", "transcript": "", "language": "python", "time_ms": 0},
    )
    assert bad.status_code == 409


async def test_single_stage_end_path_unchanged(
    integration_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Backward compatibility check: a single-stage run still completes
    via /end and returns is_multi_stage=False with no stages list."""
    await _register_and_verify(integration_client, db_session, "eve@example.com", "evemulti")
    await _seed_stub_challenge(db_session)
    await _login(integration_client, "eve@example.com")

    start = await integration_client.post(
        "/api/interviews/start", json={"topic": "arrays", "difficulty": "easy"}
    )
    session_id = start.json()["id"]

    end = await integration_client.post(
        f"/api/interviews/{session_id}/end",
        json={"solution": "pass", "transcript": "", "language": "python", "time_ms": 100},
    )
    assert end.status_code == 200
    body = end.json()
    assert body["status"] == "completed"
    assert body["is_multi_stage"] is False
    assert body["stages"] == []
