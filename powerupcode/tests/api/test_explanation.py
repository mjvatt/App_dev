"""Tests for the verbal-explanation grading helpers.

We don't test the Haiku call itself (live API). The helpers exist so a
malformed model response can't bypass the response schema's int range,
which is the part worth pinning.
"""
from services.engine_core.haiku_engine import _clamp_overall, _clamp_score


def test_clamp_score_keeps_valid_range() -> None:
    assert _clamp_score(0) == 0
    assert _clamp_score(3) == 3
    assert _clamp_score(5) == 5


def test_clamp_score_clamps_out_of_range() -> None:
    assert _clamp_score(-1) == 0
    assert _clamp_score(99) == 5


def test_clamp_score_handles_floats_and_strings() -> None:
    assert _clamp_score("4") == 4
    assert _clamp_score(3.7) == 3  # int() truncates


def test_clamp_score_returns_zero_for_garbage() -> None:
    assert _clamp_score(None) == 0
    assert _clamp_score("not a number") == 0
    assert _clamp_score({}) == 0


def test_clamp_overall_keeps_valid_range() -> None:
    assert _clamp_overall(0) == 0
    assert _clamp_overall(50) == 50
    assert _clamp_overall(100) == 100


def test_clamp_overall_clamps_out_of_range() -> None:
    assert _clamp_overall(-5) == 0
    assert _clamp_overall(150) == 100


def test_clamp_overall_returns_zero_for_garbage() -> None:
    assert _clamp_overall(None) == 0
    assert _clamp_overall("nope") == 0
