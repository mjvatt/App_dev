from datetime import UTC, datetime, timedelta, timezone

from httpx import AsyncClient

from api.models.challenge import UserProgress
from api.routers.challenges import _REVIEW_XP_CAP, _award_xp, _update_streak


def _utc(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


def test_streak_starts_at_one_for_new_user() -> None:
    progress = UserProgress(user_id="u1", total_xp=0, level=1, streak_days=0)
    _update_streak(progress, now=_utc(2026, 5, 1))
    assert progress.streak_days == 1
    assert progress.last_active == _utc(2026, 5, 1)


def test_streak_increments_on_consecutive_utc_days() -> None:
    progress = UserProgress(
        user_id="u1", total_xp=0, level=1, streak_days=3, last_active=_utc(2026, 5, 1)
    )
    _update_streak(progress, now=_utc(2026, 5, 2))
    assert progress.streak_days == 4


def test_streak_resets_after_a_gap() -> None:
    progress = UserProgress(
        user_id="u1", total_xp=0, level=1, streak_days=10, last_active=_utc(2026, 5, 1)
    )
    _update_streak(progress, now=_utc(2026, 5, 5))
    assert progress.streak_days == 1


def test_streak_unchanged_within_same_utc_day() -> None:
    progress = UserProgress(
        user_id="u1", total_xp=0, level=1, streak_days=7, last_active=_utc(2026, 5, 1, 1)
    )
    _update_streak(progress, now=_utc(2026, 5, 1, 23))
    assert progress.streak_days == 7


def test_streak_uses_utc_not_local_time() -> None:
    """A user whose last_active was 23:00 UTC and submits at 01:00 UTC the
    next calendar day should get a streak increment, regardless of where
    the server's local time falls."""
    progress = UserProgress(
        user_id="u1", total_xp=0, level=1, streak_days=2, last_active=_utc(2026, 5, 1, 23)
    )
    _update_streak(progress, now=_utc(2026, 5, 2, 1))
    assert progress.streak_days == 3


def test_streak_handles_naive_last_active_defensively() -> None:
    """Older rows might have stored naive datetimes; astimezone normalizes them."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        level=1,
        streak_days=1,
        last_active=datetime(2026, 5, 1, 12, tzinfo=timezone(timedelta(hours=-5))),
    )
    # 17:00 UTC the same day → still day 1 in UTC, streak unchanged
    _update_streak(progress, now=_utc(2026, 5, 1, 18))
    assert progress.streak_days == 1


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
