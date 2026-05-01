"""Pure-logic tests for the token economy.

Grant rules are constants + small functions in services.tokens; the
router glue is integration territory and not covered here.
"""
from services.boss_rush import STARTING_LIVES
from services.tokens import (
    TOKENS_BOSS_RUSH_COMPLETION,
    TOKENS_BOSS_RUSH_FLAWLESS_BONUS,
    TOKENS_BOSS_RUSH_REVIVE,
    TOKENS_PER_LEVEL_UP,
    grant_for_boss_rush,
    grant_for_level_up,
)


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


def test_revive_cost_is_recoverable_from_one_completion() -> None:
    """Sanity check that a player who just completed a boss rush can
    immediately afford a revive on the next run. If completion paid
    less than the revive cost, the economy collapses to no-op."""
    earn = grant_for_boss_rush("completed", lives_remaining=1)
    assert earn >= TOKENS_BOSS_RUSH_REVIVE
