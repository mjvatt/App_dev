"""Boss Rush rules and XP math.

Pure logic so the rules are testable without standing up the DB or
the engine. The router calls into this when it needs to decide what
happens after each attempt and what XP to award on terminal state.
"""
from dataclasses import dataclass

PROBLEM_COUNT = 3
STARTING_LIVES = 3

_XP_PER_PASS = 30
_COMPLETION_BONUS = 50
_FLAWLESS_BONUS = 50  # only when no lives lost across the entire run


@dataclass(frozen=True)
class RunOutcome:
    """Result of applying one attempt to a run snapshot. The router
    uses this to decide what to write to the DB and what to return."""
    new_current_index: int
    new_lives_remaining: int
    new_status: str  # in_progress | completed | wiped
    xp_awarded: int | None  # None while in_progress; final value on terminal


def apply_attempt(
    *,
    passed: bool,
    current_index: int,
    lives_remaining: int,
) -> RunOutcome:
    """Compute the next run state given an attempt outcome.

    Pass advances current_index. Fail decrements lives_remaining. The
    run is `completed` when all PROBLEM_COUNT problems are passed, and
    `wiped` when lives_remaining hits 0 with passes still outstanding."""
    if passed:
        new_index = current_index + 1
        new_lives = lives_remaining
        if new_index >= PROBLEM_COUNT:
            xp = _final_xp(passes=new_index, lives_remaining=new_lives, completed=True)
            return RunOutcome(new_index, new_lives, "completed", xp)
        return RunOutcome(new_index, new_lives, "in_progress", None)

    new_lives = lives_remaining - 1
    if new_lives <= 0:
        xp = _final_xp(passes=current_index, lives_remaining=0, completed=False)
        return RunOutcome(current_index, 0, "wiped", xp)
    return RunOutcome(current_index, new_lives, "in_progress", None)


def _final_xp(*, passes: int, lives_remaining: int, completed: bool) -> int:
    base = passes * _XP_PER_PASS
    completion_bonus = _COMPLETION_BONUS if completed else 0
    flawless_bonus = (
        _FLAWLESS_BONUS if completed and lives_remaining == STARTING_LIVES else 0
    )
    return base + completion_bonus + flawless_bonus
