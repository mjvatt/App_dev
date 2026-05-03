"""Power-up token economy.

Pure rules layer — what events earn tokens and what they cost. Routers
call into these constants when granting / spending so the economy is
auditable in one place rather than scattered as inline literals.

Phase 1 shipped earning at level-up + Boss Rush completion and spending
on post-wipe Boss Rush revives.

Phase 2 (Tokens v2) adds:
  Earn: daily-streak milestones, activity-streak milestones, Mock
        Interview score thresholds, first-pass on hard/boss tier.
  Spend: mid-run Boss Rush extra life, Mock Interview time-freeze.

Solvency invariants enforced by tests in tests/api/test_tokens.py:
  * One full Boss Rush completion always covers one post-wipe revive.
  * Two full Boss Rush completions always cover one mid-run extra life.
  * One Mock Interview score >= 90 always covers one time-freeze.
"""
from services.boss_rush import STARTING_LIVES
from services.engine.interface import Difficulty

# ---------------------------------------------------------------------
# Earnings
# ---------------------------------------------------------------------

TOKENS_PER_LEVEL_UP = 2
TOKENS_BOSS_RUSH_COMPLETION = 5
TOKENS_BOSS_RUSH_FLAWLESS_BONUS = 5  # stacks with completion -> 10 total

# Streak milestones — granted once per crossing. Maps milestone day to
# token reward. Milestones not in the map grant 0 (defensive); callers
# already guard with _milestone_just_hit to deliver crossings.
TOKENS_DAILY_STREAK_MILESTONE_REWARDS: dict[int, int] = {
    3: 3,
    7: 10,
    14: 15,
    30: 25,
    100: 100,
    365: 365,
}
TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS: dict[int, int] = {
    3: 1,
    7: 3,
    14: 7,
    30: 15,
    60: 30,
    100: 60,
    365: 200,
}

# Mock Interview thresholds. The grant is the *total* at that score band
# rather than additive — score 95 returns the >=90 reward, not 80+90.
TOKENS_INTERVIEW_SCORE_GOOD = 5      # score >= 80
TOKENS_INTERVIEW_SCORE_GREAT = 10    # score >= 90
TOKENS_INTERVIEW_SCORE_GOOD_THRESHOLD = 80
TOKENS_INTERVIEW_SCORE_GREAT_THRESHOLD = 90

# First-pass-on-tier bonus. Repeat passes on the same challenge do not
# grant again — caller must pass is_repeat_pass=True for those.
TOKENS_FIRST_HARD_PASS = 3
TOKENS_FIRST_BOSS_PASS = 5

# ---------------------------------------------------------------------
# Costs
# ---------------------------------------------------------------------

TOKENS_BOSS_RUSH_REVIVE = 5            # post-wipe; restores 1 life
TOKENS_BOSS_RUSH_EXTRA_LIFE = 7        # mid-run; cost > revive on purpose
                                       # so post-wipe rescue stays the
                                       # cheaper, more dramatic option
TOKENS_INTERVIEW_TIME_FREEZE = 5       # bumps soft target by +5 minutes
TOKENS_DAILY_STREAK_SHIELD = 5         # one shield = covers one missed
                                       # daily; auto-consumed on next
                                       # solve when a gap exists
MAX_DAILY_STREAK_SHIELDS = 3           # stockpile cap. Three is enough
                                       # to bridge a long weekend (Sat-
                                       # Sun-Mon) but doesn't let a
                                       # wealthy account vacation through
                                       # a streak indefinitely

# Friend-to-friend token gifting (Tokens v3). Bounded amount per gift
# plus one-gift-per-recipient-per-UTC-day rate limit so the system
# can't be turned into a launder loop or a notification-spam vehicle.
MIN_GIFT_TOKENS = 1
MAX_GIFT_TOKENS = 25
MAX_GIFTS_PER_DAY_PER_RECIPIENT = 1


# ---------------------------------------------------------------------
# Earn helpers
# ---------------------------------------------------------------------

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


def grant_for_daily_streak_milestone(milestone: int | None) -> int:
    """Tokens for crossing a daily-streak milestone. Caller passes the
    return value of _daily_milestone_just_hit, which is None when no
    milestone was crossed on this attempt."""
    if milestone is None:
        return 0
    return TOKENS_DAILY_STREAK_MILESTONE_REWARDS.get(milestone, 0)


def grant_for_activity_streak_milestone(milestone: int | None) -> int:
    """Tokens for crossing an activity-streak milestone. Caller passes
    the return value of _milestone_just_hit, which is None when no
    milestone was crossed on this attempt."""
    if milestone is None:
        return 0
    return TOKENS_ACTIVITY_STREAK_MILESTONE_REWARDS.get(milestone, 0)


def grant_for_interview_score(score: int | None) -> int:
    """Tokens for ending a Mock Interview at a given graded score.
    None or sub-threshold scores grant nothing. Bands do not stack —
    score >= 90 returns the great reward, not great + good."""
    if score is None:
        return 0
    if score >= TOKENS_INTERVIEW_SCORE_GREAT_THRESHOLD:
        return TOKENS_INTERVIEW_SCORE_GREAT
    if score >= TOKENS_INTERVIEW_SCORE_GOOD_THRESHOLD:
        return TOKENS_INTERVIEW_SCORE_GOOD
    return 0


def grant_for_first_pass(
    difficulty: Difficulty | str | None,
    *,
    passed: bool,
    is_repeat_pass: bool,
) -> int:
    """Tokens for the first time the user passes a hard- or boss-tier
    challenge. Repeat passes of an already-solved challenge grant
    nothing so the bonus rewards new ground only.

    Boss-tier first-pass via Quick Play is rare (boss content normally
    flows through Boss Rush which has its own grant) but we still pay
    for it so the path doesn't feel dead."""
    if not passed or is_repeat_pass or difficulty is None:
        return 0
    value = difficulty.value if isinstance(difficulty, Difficulty) else difficulty
    if value == Difficulty.HARD.value:
        return TOKENS_FIRST_HARD_PASS
    if value == Difficulty.BOSS.value:
        return TOKENS_FIRST_BOSS_PASS
    return 0
