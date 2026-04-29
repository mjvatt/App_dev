"""
SM-2 spaced repetition algorithm.

Pure functions only. The router layer composes the DB lookup, calls
schedule_next() with the user's prior state and a quality grade, and
writes the new state back. No side effects here.

SM-2 maps a 0-5 quality grade to:
  - a multiplicative ease factor (>= 1.3) that grows on success and
    decays on failure
  - an interval in days until the next review
  - a "repetitions" counter that resets to 0 on failure

PowerUpCode quality grading (derived from the attempt result):
  failed                                -> 1  (forgot it)
  passed, all hints used                -> 3  (recalled with effort)
  passed, 1-2 hints                     -> 4  (some friction)
  passed, no hints                      -> 5  (clean recall)
"""
from dataclasses import dataclass

DEFAULT_EASE = 2.5
MIN_EASE = 1.3
FAIL_GRADE_THRESHOLD = 3  # quality < threshold treated as failure


@dataclass(frozen=True)
class ReviewState:
    ease_factor: float
    interval_days: int
    repetitions: int


def grade_attempt(passed: bool, hints_used: int) -> int:
    """Derive an SM-2 quality grade from the attempt result."""
    if not passed:
        return 1
    if hints_used == 0:
        return 5
    if hints_used <= 2:
        return 4
    return 3


def schedule_next(prior: ReviewState, quality: int) -> ReviewState:
    """Compute the next review state given the user's prior state and
    the quality grade for this review."""
    quality = max(0, min(5, quality))

    if quality < FAIL_GRADE_THRESHOLD:
        # The user got it wrong. Reset the cadence to short-term review;
        # ease decays only via the formula below.
        new_ease = max(MIN_EASE, prior.ease_factor + 0.1 - (5 - quality) * 0.08)
        return ReviewState(ease_factor=new_ease, interval_days=1, repetitions=0)

    # Successful recall.
    if prior.repetitions == 0:
        next_interval = 1
    elif prior.repetitions == 1:
        next_interval = 6
    else:
        next_interval = max(1, round(prior.interval_days * prior.ease_factor))

    new_ease = prior.ease_factor + (
        0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )
    new_ease = max(MIN_EASE, new_ease)

    return ReviewState(
        ease_factor=new_ease,
        interval_days=next_interval,
        repetitions=prior.repetitions + 1,
    )
