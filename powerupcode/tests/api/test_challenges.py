from httpx import AsyncClient

from api.routers.challenges import _REVIEW_XP_CAP, _award_xp


def test_award_xp_failed_attempt_returns_raw_xp() -> None:
    assert _award_xp(0, passed=False, is_repeat_pass=False) == 0
    assert _award_xp(50, passed=False, is_repeat_pass=False) == 50  # engine could still award


def test_award_xp_first_pass_returns_full_xp() -> None:
    assert _award_xp(50, passed=True, is_repeat_pass=False) == 50


def test_award_xp_repeat_pass_capped() -> None:
    assert _award_xp(50, passed=True, is_repeat_pass=True) == _REVIEW_XP_CAP
    assert _award_xp(1000, passed=True, is_repeat_pass=True) == _REVIEW_XP_CAP


def test_award_xp_repeat_pass_under_cap_returns_actual() -> None:
    assert _award_xp(2, passed=True, is_repeat_pass=True) == 2


async def test_health(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_next_challenge_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/challenges/next")
    assert res.status_code == 401


async def test_submit_attempt_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/api/challenges/stub-001/attempt", json={"solution": "pass"})
    assert res.status_code == 401


async def test_hint_requires_auth(client: AsyncClient) -> None:
    res = await client.post(
        "/api/challenges/stub-001/hint", json={"current_attempt": "pass"}
    )
    assert res.status_code == 401
