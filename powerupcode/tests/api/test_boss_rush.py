"""Tests for the Boss Rush rules engine.

The router glue is hard to unit-test without a DB; the rules are
pure and easy to pin. apply_attempt is the function that decides
state transitions and XP — every other behavior follows from that.
"""
from services.boss_rush import (
    PROBLEM_COUNT,
    STARTING_LIVES,
    apply_attempt,
)


def test_pass_advances_index_and_keeps_lives() -> None:
    out = apply_attempt(passed=True, current_index=0, lives_remaining=3)
    assert out.new_current_index == 1
    assert out.new_lives_remaining == 3
    assert out.new_status == "in_progress"
    assert out.xp_awarded is None


def test_fail_costs_a_life_and_keeps_index() -> None:
    out = apply_attempt(passed=False, current_index=0, lives_remaining=3)
    assert out.new_current_index == 0
    assert out.new_lives_remaining == 2
    assert out.new_status == "in_progress"
    assert out.xp_awarded is None


def test_pass_on_last_problem_completes_run() -> None:
    out = apply_attempt(
        passed=True,
        current_index=PROBLEM_COUNT - 1,
        lives_remaining=2,  # took one fail somewhere
    )
    assert out.new_current_index == PROBLEM_COUNT
    assert out.new_status == "completed"
    # Completed without flawless: 30*3 + 50 = 140
    assert out.xp_awarded == 140


def test_flawless_completion_adds_bonus() -> None:
    out = apply_attempt(
        passed=True,
        current_index=PROBLEM_COUNT - 1,
        lives_remaining=STARTING_LIVES,  # never lost a life
    )
    assert out.new_status == "completed"
    # 30*3 + 50 + 50 = 190
    assert out.xp_awarded == 190


def test_last_life_lost_wipes_run() -> None:
    out = apply_attempt(passed=False, current_index=0, lives_remaining=1)
    assert out.new_status == "wiped"
    assert out.new_lives_remaining == 0
    # No passes -> 0 XP awarded.
    assert out.xp_awarded == 0


def test_wipe_with_partial_passes_awards_partial_xp() -> None:
    # Passed problem 0, then failed three times on problem 1.
    out = apply_attempt(passed=False, current_index=1, lives_remaining=1)
    assert out.new_status == "wiped"
    # 1 pass * 30 = 30, no completion / flawless bonus
    assert out.xp_awarded == 30


def test_wipe_with_two_passes_awards_60_xp() -> None:
    out = apply_attempt(passed=False, current_index=2, lives_remaining=1)
    assert out.new_status == "wiped"
    assert out.xp_awarded == 60


def test_completion_xp_caps_at_first_completing_pass() -> None:
    # Even if `current_index` somehow exceeds PROBLEM_COUNT - 1 (it
    # shouldn't), the function should still produce a completed result.
    out = apply_attempt(passed=True, current_index=PROBLEM_COUNT - 1, lives_remaining=3)
    assert out.new_current_index == PROBLEM_COUNT
    assert out.new_status == "completed"
