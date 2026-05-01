"""Power-up token economy.

Pure rules layer — what events earn tokens and what they cost. The
routers call into these constants when granting / spending so the
economy is auditable in one place rather than scattered as inline
literals.

Phase 1 ships earning at level-up and Boss Rush completion; spending
on Boss Rush revives. Future earn paths (streak milestones, daily
streak milestones) and spend paths (interview time-freeze, hint
discount) will land here as additional named events.
"""
from services.boss_rush import STARTING_LIVES

# Earnings
TOKENS_PER_LEVEL_UP = 2
TOKENS_BOSS_RUSH_COMPLETION = 5
TOKENS_BOSS_RUSH_FLAWLESS_BONUS = 5  # stacks with completion -> 10 total

# Costs
TOKENS_BOSS_RUSH_REVIVE = 5


def grant_for_level_up(prior_level: int, new_level: int) -> int:
    """Tokens to grant when the user's level increased on this attempt.
    Multi-level jumps grant tokens per level so a big XP burst is
    rewarded proportionally."""
    if new_level <= prior_level:
        return 0
    return (new_level - prior_level) * TOKENS_PER_LEVEL_UP


def grant_for_boss_rush(status: str, lives_remaining: int) -> int:
    """Tokens to grant on Boss Rush terminal status. Wipes earn nothing
    (the run XP partial-credit is already the consolation); completion
    earns the base bonus, with an additional flawless bonus when no
    lives were lost across the entire run."""
    if status != "completed":
        return 0
    bonus = TOKENS_BOSS_RUSH_COMPLETION
    if lives_remaining == STARTING_LIVES:
        bonus += TOKENS_BOSS_RUSH_FLAWLESS_BONUS
    return bonus
