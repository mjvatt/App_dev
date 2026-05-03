from datetime import UTC, date, datetime, timedelta, timezone

from httpx import AsyncClient

from api.models.challenge import UserProgress
from api.routers.challenges import (
    _REVIEW_XP_CAP,
    _award_xp,
    _daily_milestone_just_hit,
    _milestone_just_hit,
    _update_daily_streak,
    _update_streak,
)


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


def test_milestone_returns_first_crossed_value() -> None:
    assert _milestone_just_hit(prior=2, current=3) == 3
    assert _milestone_just_hit(prior=6, current=7) == 7
    assert _milestone_just_hit(prior=29, current=30) == 30


def test_milestone_returns_none_when_no_threshold_crossed() -> None:
    assert _milestone_just_hit(prior=5, current=6) is None
    assert _milestone_just_hit(prior=14, current=15) is None
    assert _milestone_just_hit(prior=100, current=101) is None


def test_milestone_handles_streak_jumps_taking_first_only() -> None:
    # If a user somehow leaps multiple milestones in one update we surface
    # the lowest crossed; the modal logic only celebrates one boundary.
    assert _milestone_just_hit(prior=1, current=10) == 3


def test_milestone_returns_none_on_streak_reset() -> None:
    assert _milestone_just_hit(prior=10, current=1) is None


def test_daily_streak_starts_at_one_for_new_user() -> None:
    progress = UserProgress(user_id="u1", total_xp=0, daily_streak_days=0)
    _update_daily_streak(progress, today_utc=date(2026, 5, 1))
    assert progress.daily_streak_days == 1
    assert progress.last_daily_solved_date == date(2026, 5, 1)


def test_daily_streak_increments_on_consecutive_days() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=4,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 2))
    assert progress.daily_streak_days == 5
    assert progress.last_daily_solved_date == date(2026, 5, 2)


def test_daily_streak_resets_after_a_gap() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 4))
    assert progress.daily_streak_days == 1


def test_daily_streak_one_day_gap_consumes_one_shield() -> None:
    """Missed yesterday but had a shield — streak survives, one shield
    spent, returned count tells the caller to fire the toast."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        last_daily_solved_date=date(2026, 5, 1),
        streak_shields=2,
    )
    consumed = _update_daily_streak(progress, today_utc=date(2026, 5, 3))
    assert consumed == 1
    assert progress.streak_shields == 1
    assert progress.daily_streak_days == 13


def test_daily_streak_multi_day_gap_consumes_multiple_shields() -> None:
    """Two missed days needs two shields. Streak still counts as one
    new solve on top, so 12 -> 13."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        last_daily_solved_date=date(2026, 5, 1),
        streak_shields=3,
    )
    consumed = _update_daily_streak(progress, today_utc=date(2026, 5, 4))
    assert consumed == 2
    assert progress.streak_shields == 1
    assert progress.daily_streak_days == 13


def test_daily_streak_insufficient_shields_resets_and_keeps_them() -> None:
    """Two missed days but only one shield. We DON'T burn the shield
    on a partial bridge — that would feel like a bug. Reset and keep
    the inventory for next time."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        last_daily_solved_date=date(2026, 5, 1),
        streak_shields=1,
    )
    consumed = _update_daily_streak(progress, today_utc=date(2026, 5, 4))
    assert consumed == 0
    assert progress.streak_shields == 1  # untouched
    assert progress.daily_streak_days == 1


def test_daily_streak_no_shields_field_treated_as_zero() -> None:
    """Defensive: a UserProgress instance that hasn't been flushed yet
    has streak_shields = None until the server-default fires. The helper
    must treat that as 0 rather than crashing on the >= comparison."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=5,
        last_daily_solved_date=date(2026, 5, 1),
    )
    # Don't pass streak_shields — exercise the `or 0` guard
    consumed = _update_daily_streak(progress, today_utc=date(2026, 5, 3))
    assert consumed == 0
    assert progress.daily_streak_days == 1


def test_daily_streak_consecutive_day_does_not_consume_shield() -> None:
    """Sanity: shields are only spent on actual gaps. A normal next-day
    solve must leave inventory untouched — otherwise we'd silently
    burn through stockpiles on every solve."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=4,
        last_daily_solved_date=date(2026, 5, 1),
        streak_shields=2,
    )
    consumed = _update_daily_streak(progress, today_utc=date(2026, 5, 2))
    assert consumed == 0
    assert progress.streak_shields == 2


def test_daily_streak_idempotent_within_same_day() -> None:
    """A second daily-pass on the same UTC date must not double-count.
    The submit handler can call _update_daily_streak twice in flight if
    the user pounds the button on a 're-solve today' button later."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=7,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 1))
    assert progress.daily_streak_days == 7


def test_longest_streak_ratchets_on_increment() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        streak_days=3,
        longest_streak=3,
        last_active=_utc(2026, 5, 1),
    )
    _update_streak(progress, now=_utc(2026, 5, 2))
    assert progress.streak_days == 4
    assert progress.longest_streak == 4


def test_longest_streak_does_not_decrement_on_reset() -> None:
    """A 10-day streak that breaks must not erase the personal best."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        streak_days=10,
        longest_streak=10,
        last_active=_utc(2026, 5, 1),
    )
    _update_streak(progress, now=_utc(2026, 5, 5))
    assert progress.streak_days == 1
    assert progress.longest_streak == 10


def test_longest_streak_unchanged_within_same_utc_day() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        streak_days=7,
        longest_streak=12,
        last_active=_utc(2026, 5, 1, 1),
    )
    _update_streak(progress, now=_utc(2026, 5, 1, 23))
    assert progress.longest_streak == 12


def test_longest_streak_handles_uninitialized_field_as_zero() -> None:
    """Defensive: a bare UserProgress() has longest_streak=None until the
    server-default fires. The ratchet must coerce that to 0 rather than
    crash on max(None, int)."""
    progress = UserProgress(user_id="u1", total_xp=0, streak_days=0)
    _update_streak(progress, now=_utc(2026, 5, 1))
    assert progress.streak_days == 1
    assert progress.longest_streak == 1


def test_longest_daily_streak_ratchets_on_increment() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=4,
        longest_daily_streak=4,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 2))
    assert progress.daily_streak_days == 5
    assert progress.longest_daily_streak == 5


def test_longest_daily_streak_does_not_decrement_on_reset() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        longest_daily_streak=12,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 4))
    assert progress.daily_streak_days == 1
    assert progress.longest_daily_streak == 12


def test_longest_daily_streak_unchanged_when_idempotent_same_day() -> None:
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=7,
        longest_daily_streak=15,
        last_daily_solved_date=date(2026, 5, 1),
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 1))
    assert progress.longest_daily_streak == 15


def test_longest_daily_streak_handles_uninitialized_field_as_zero() -> None:
    progress = UserProgress(user_id="u1", total_xp=0, daily_streak_days=0)
    _update_daily_streak(progress, today_utc=date(2026, 5, 1))
    assert progress.daily_streak_days == 1
    assert progress.longest_daily_streak == 1


def test_longest_daily_streak_ratchets_through_shield_bridge() -> None:
    """A shield-bridged increment must update longest_daily_streak too —
    the user kept the streak alive, the personal best should reflect that."""
    progress = UserProgress(
        user_id="u1",
        total_xp=0,
        daily_streak_days=12,
        longest_daily_streak=12,
        last_daily_solved_date=date(2026, 5, 1),
        streak_shields=2,
    )
    _update_daily_streak(progress, today_utc=date(2026, 5, 3))
    assert progress.daily_streak_days == 13
    assert progress.longest_daily_streak == 13


def test_daily_milestone_first_threshold_is_three() -> None:
    assert _daily_milestone_just_hit(prior=2, current=3) == 3


def test_daily_milestone_returns_none_when_not_crossed() -> None:
    assert _daily_milestone_just_hit(prior=4, current=5) is None
    assert _daily_milestone_just_hit(prior=14, current=15) is None


def test_daily_milestone_returns_none_on_reset() -> None:
    assert _daily_milestone_just_hit(prior=30, current=1) is None


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
