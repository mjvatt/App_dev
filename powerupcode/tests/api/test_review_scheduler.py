from services.review.scheduler import (
    DEFAULT_EASE,
    MIN_EASE,
    ReviewState,
    grade_attempt,
    schedule_next,
)


def test_grade_attempt_failed_is_low() -> None:
    assert grade_attempt(passed=False, hints_used=0) == 1
    assert grade_attempt(passed=False, hints_used=3) == 1


def test_grade_attempt_clean_pass_is_top() -> None:
    assert grade_attempt(passed=True, hints_used=0) == 5


def test_grade_attempt_partial_hints_in_middle() -> None:
    assert grade_attempt(passed=True, hints_used=1) == 4
    assert grade_attempt(passed=True, hints_used=2) == 4
    assert grade_attempt(passed=True, hints_used=3) == 3


def test_first_review_pass_uses_one_day_interval() -> None:
    initial = ReviewState(ease_factor=DEFAULT_EASE, interval_days=0, repetitions=0)
    next_state = schedule_next(initial, quality=5)
    assert next_state.interval_days == 1
    assert next_state.repetitions == 1


def test_second_review_pass_jumps_to_six_days() -> None:
    after_first = ReviewState(ease_factor=DEFAULT_EASE, interval_days=1, repetitions=1)
    next_state = schedule_next(after_first, quality=5)
    assert next_state.interval_days == 6
    assert next_state.repetitions == 2


def test_third_review_uses_ease_multiplier() -> None:
    state = ReviewState(ease_factor=2.6, interval_days=6, repetitions=2)
    next_state = schedule_next(state, quality=5)
    # 6 * 2.6 = 15.6, rounds to 16
    assert next_state.interval_days == 16
    assert next_state.repetitions == 3


def test_failure_resets_repetitions_and_keeps_ease_floor() -> None:
    state = ReviewState(ease_factor=2.5, interval_days=20, repetitions=4)
    next_state = schedule_next(state, quality=1)
    assert next_state.repetitions == 0
    assert next_state.interval_days == 1
    assert next_state.ease_factor >= MIN_EASE


def test_repeated_failures_floor_ease_at_minimum() -> None:
    state = ReviewState(ease_factor=MIN_EASE, interval_days=1, repetitions=0)
    for _ in range(5):
        state = schedule_next(state, quality=1)
    assert state.ease_factor == MIN_EASE


def test_clean_passes_grow_ease_factor() -> None:
    state = ReviewState(ease_factor=DEFAULT_EASE, interval_days=0, repetitions=0)
    for _ in range(3):
        state = schedule_next(state, quality=5)
    assert state.ease_factor > DEFAULT_EASE


def test_quality_clamped_to_valid_range() -> None:
    initial = ReviewState(ease_factor=DEFAULT_EASE, interval_days=0, repetitions=0)
    # Out-of-range quality values are clamped, not crashed.
    schedule_next(initial, quality=-5)
    schedule_next(initial, quality=99)
