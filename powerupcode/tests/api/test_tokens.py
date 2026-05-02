"""Pure-logic tests for the token economy.

Grant rules are constants + small functions in services.tokens; the
router glue is integration territory and not covered here.
"""
import pytest

from services.boss_rush import STARTING_LIVES
from services.engine.interface import Difficulty
from services.tokens import (
    TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS,
    TOKENS_BOSS_RUSH_COMPLETION,
    TOKENS_BOSS_RUSH_EXTRA_LIFE,
    TOKENS_BOSS_RUSH_FLAWLESS_BONUS,
    TOKENS_BOSS_RUSH_REVIVE,
    TOKENS_DAILY_STREAK_MILESTONE_REWARDS,
    TOKENS_FIRST_BOSS_PASS,
    TOKENS_FIRST_HARD_PASS,
    TOKENS_INTERVIEW_SCORE_GOOD,
    TOKENS_INTERVIEW_SCORE_GREAT,
    TOKENS_INTERVIEW_TIME_FREEZE,
    TOKENS_PER_LEVEL_UP,
    grant_for_activity_streak_milestone,
    grant_for_boss_rush,
    grant_for_daily_streak_milestone,
    grant_for_first_pass,
    grant_for_interview_score,
    grant_for_level_up,
)

# ---------------------------------------------------------------------
# Level-up
# ---------------------------------------------------------------------

def test_no_level_up_grants_nothing() -> None:
    assert grant_for_level_up(prior_level=4, new_level=4) == 0


def test_single_level_up_grants_base() -> None:
    assert grant_for_level_up(prior_level=4, new_level=5) == TOKENS_PER_LEVEL_UP


def test_multi_level_jump_grants_per_level() -> None:
    assert grant_for_level_up(prior_level=4, new_level=7) == 3 * TOKENS_PER_LEVEL_UP


def test_level_down_grants_nothing() -> None:
    """Defensive: should never happen but a buggy total_xp recomputation
    must not pay out negative tokens."""
    assert grant_for_level_up(prior_level=10, new_level=8) == 0


# ---------------------------------------------------------------------
# Boss Rush terminal grant
# ---------------------------------------------------------------------

def test_boss_rush_wipe_grants_nothing() -> None:
    assert grant_for_boss_rush("wiped", lives_remaining=0) == 0
    assert grant_for_boss_rush("wiped", lives_remaining=1) == 0


def test_boss_rush_in_progress_grants_nothing() -> None:
    """Defensive: the function should be no-op for non-terminal states."""
    assert grant_for_boss_rush("in_progress", lives_remaining=2) == 0


def test_boss_rush_completion_with_fails_grants_base() -> None:
    assert (
        grant_for_boss_rush("completed", lives_remaining=1)
        == TOKENS_BOSS_RUSH_COMPLETION
    )


def test_boss_rush_flawless_completion_grants_full_bonus() -> None:
    assert (
        grant_for_boss_rush("completed", lives_remaining=STARTING_LIVES)
        == TOKENS_BOSS_RUSH_COMPLETION + TOKENS_BOSS_RUSH_FLAWLESS_BONUS
    )


# ---------------------------------------------------------------------
# Daily streak milestone
# ---------------------------------------------------------------------

def test_daily_streak_no_milestone_grants_nothing() -> None:
    assert grant_for_daily_streak_milestone(None) == 0


@pytest.mark.parametrize("milestone,expected", list(TOKENS_DAILY_STREAK_MILESTONE_REWARDS.items()))
def test_daily_streak_each_milestone_pays_mapped_reward(
    milestone: int, expected: int
) -> None:
    assert grant_for_daily_streak_milestone(milestone) == expected


def test_daily_streak_unknown_milestone_grants_nothing() -> None:
    """Defensive: if a future call passes a milestone not in the table
    (eg from a stale config) we silently no-op rather than error."""
    assert grant_for_daily_streak_milestone(999) == 0


def test_daily_streak_rewards_are_monotonic() -> None:
    """Sanity: longer streaks should not pay less than shorter ones,
    otherwise the incentive shape is broken."""
    sorted_keys = sorted(TOKENS_DAILY_STREAK_MILESTONE_REWARDS)
    rewards = [TOKENS_DAILY_STREAK_MILESTONE_REWARDS[k] for k in sorted_keys]
    assert rewards == sorted(rewards)


# ---------------------------------------------------------------------
# Activity streak milestone
# ---------------------------------------------------------------------

def test_activity_streak_no_milestone_grants_nothing() -> None:
    assert grant_for_activity_streak_milestone(None) == 0


@pytest.mark.parametrize(
    "milestone,expected", list(TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS.items())
)
def test_activity_streak_each_milestone_pays_mapped_reward(
    milestone: int, expected: int
) -> None:
    assert grant_for_activity_streak_milestone(milestone) == expected


def test_activity_streak_unknown_milestone_grants_nothing() -> None:
    assert grant_for_activity_streak_milestone(42) == 0


def test_activity_streak_rewards_are_monotonic() -> None:
    sorted_keys = sorted(TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS)
    rewards = [TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS[k] for k in sorted_keys]
    assert rewards == sorted(rewards)


def test_activity_streak_pays_less_than_daily_at_same_milestone() -> None:
    """Daily-challenge streaks are harder to maintain than plain activity
    streaks (must pass that day's daily, not just any submission), so the
    daily reward should beat or match the activity reward at any shared
    milestone day. Otherwise the easier loop out-pays the harder loop."""
    shared = set(TOKENS_DAILY_STREAK_MILESTONE_REWARDS) & set(
        TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS
    )
    assert shared, "expected overlapping milestones to compare"
    for m in shared:
        assert (
            TOKENS_DAILY_STREAK_MILESTONE_REWARDS[m]
            >= TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS[m]
        ), f"milestone {m}: daily reward must >= activity reward"


# ---------------------------------------------------------------------
# Mock Interview score thresholds
# ---------------------------------------------------------------------

def test_interview_score_none_grants_nothing() -> None:
    assert grant_for_interview_score(None) == 0


def test_interview_score_below_good_threshold_grants_nothing() -> None:
    assert grant_for_interview_score(0) == 0
    assert grant_for_interview_score(79) == 0


def test_interview_score_at_good_threshold_grants_good() -> None:
    assert grant_for_interview_score(80) == TOKENS_INTERVIEW_SCORE_GOOD


def test_interview_score_in_good_band_grants_good() -> None:
    assert grant_for_interview_score(85) == TOKENS_INTERVIEW_SCORE_GOOD
    assert grant_for_interview_score(89) == TOKENS_INTERVIEW_SCORE_GOOD


def test_interview_score_at_great_threshold_grants_great() -> None:
    assert grant_for_interview_score(90) == TOKENS_INTERVIEW_SCORE_GREAT


def test_interview_score_perfect_grants_great() -> None:
    assert grant_for_interview_score(100) == TOKENS_INTERVIEW_SCORE_GREAT


def test_interview_bands_do_not_stack() -> None:
    """A 95 should pay the great reward, not good + great. Stacking
    would let a single high-score session pay for a mid-run extra life
    plus a freeze, distorting the economy."""
    assert grant_for_interview_score(95) == TOKENS_INTERVIEW_SCORE_GREAT
    assert grant_for_interview_score(95) < (
        TOKENS_INTERVIEW_SCORE_GOOD + TOKENS_INTERVIEW_SCORE_GREAT
    )


# ---------------------------------------------------------------------
# First-pass-on-tier bonus
# ---------------------------------------------------------------------

def test_first_pass_failed_attempt_grants_nothing() -> None:
    assert (
        grant_for_first_pass(Difficulty.HARD, passed=False, is_repeat_pass=False)
        == 0
    )


def test_first_pass_repeat_pass_grants_nothing() -> None:
    assert (
        grant_for_first_pass(Difficulty.HARD, passed=True, is_repeat_pass=True)
        == 0
    )


def test_first_pass_no_difficulty_grants_nothing() -> None:
    assert grant_for_first_pass(None, passed=True, is_repeat_pass=False) == 0


def test_first_pass_easy_grants_nothing() -> None:
    assert (
        grant_for_first_pass(Difficulty.EASY, passed=True, is_repeat_pass=False) == 0
    )


def test_first_pass_medium_grants_nothing() -> None:
    """Medium passes don't count — the bonus exists to reward the harder
    tiers specifically."""
    assert (
        grant_for_first_pass(Difficulty.MEDIUM, passed=True, is_repeat_pass=False)
        == 0
    )


def test_first_pass_hard_grants_hard_bonus() -> None:
    assert (
        grant_for_first_pass(Difficulty.HARD, passed=True, is_repeat_pass=False)
        == TOKENS_FIRST_HARD_PASS
    )


def test_first_pass_boss_grants_boss_bonus() -> None:
    assert (
        grant_for_first_pass(Difficulty.BOSS, passed=True, is_repeat_pass=False)
        == TOKENS_FIRST_BOSS_PASS
    )


def test_first_pass_accepts_string_difficulty() -> None:
    """Some call sites carry difficulty as a stringly-typed value
    (eg result.difficulty.value already unpacked); the helper should
    match the underlying enum value either way."""
    assert (
        grant_for_first_pass("hard", passed=True, is_repeat_pass=False)
        == TOKENS_FIRST_HARD_PASS
    )
    assert (
        grant_for_first_pass("boss", passed=True, is_repeat_pass=False)
        == TOKENS_FIRST_BOSS_PASS
    )


def test_first_boss_pass_pays_more_than_first_hard_pass() -> None:
    assert TOKENS_FIRST_BOSS_PASS > TOKENS_FIRST_HARD_PASS


# ---------------------------------------------------------------------
# Solvency invariants
# ---------------------------------------------------------------------

def test_revive_cost_is_recoverable_from_one_completion() -> None:
    """Sanity check that a player who just completed a boss rush can
    immediately afford a revive on the next run. If completion paid
    less than the revive cost, the economy collapses to no-op."""
    earn = grant_for_boss_rush("completed", lives_remaining=1)
    assert earn >= TOKENS_BOSS_RUSH_REVIVE


def test_two_completions_cover_one_mid_run_extra_life() -> None:
    """Mid-run extra life should be reachable from sustained Boss Rush
    play. Two non-flawless completions covering one extra life keeps
    the spend from feeling unreachable for mid-skill players."""
    two_completions = 2 * grant_for_boss_rush("completed", lives_remaining=1)
    assert two_completions >= TOKENS_BOSS_RUSH_EXTRA_LIFE


def test_one_great_interview_covers_one_time_freeze() -> None:
    """An interview score >= 90 should fully fund one time-freeze;
    otherwise the freeze becomes effectively unreachable from the
    interview loop and its main earn path is broken."""
    assert TOKENS_INTERVIEW_SCORE_GREAT >= TOKENS_INTERVIEW_TIME_FREEZE


def test_extra_life_costs_more_than_post_wipe_revive() -> None:
    """Mid-run extra life is the dramatic save and should be priced
    above the post-wipe revive — otherwise nobody wipes on purpose
    and the wipe-screen revive surface goes unused."""
    assert TOKENS_BOSS_RUSH_EXTRA_LIFE > TOKENS_BOSS_RUSH_REVIVE
