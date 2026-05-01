"""Pure-logic tests for the interview-session helpers.

Round-trip serialization for the strengths/improvements list, and the
JSON-coercion helper that protects the response schema from malformed
Haiku output.
"""
from api.routers.interview import _BULLET_JOIN, _split_bullets
from services.engine_core.haiku_engine import _clean_bullet_list


def test_split_bullets_returns_empty_for_none() -> None:
    assert _split_bullets(None) == []


def test_split_bullets_returns_empty_for_empty_string() -> None:
    assert _split_bullets("") == []


def test_split_bullets_round_trips_with_join() -> None:
    items = ["named the right complexity", "walked an edge case", "checked input bounds"]
    blob = _BULLET_JOIN.join(items)
    assert _split_bullets(blob) == items


def test_split_bullets_skips_blank_lines() -> None:
    blob = "first\n\nsecond\n   \nthird"
    assert _split_bullets(blob) == ["first", "second", "third"]


def test_clean_bullet_list_handles_non_list_input() -> None:
    assert _clean_bullet_list(None) == []
    assert _clean_bullet_list("just a string") == []
    assert _clean_bullet_list({"a": 1}) == []


def test_clean_bullet_list_drops_non_strings() -> None:
    raw = ["valid", 42, None, {"nested": "object"}, "also valid"]
    assert _clean_bullet_list(raw) == ["valid", "also valid"]


def test_clean_bullet_list_strips_and_skips_empty() -> None:
    raw = ["  hello  ", "   ", "world"]
    assert _clean_bullet_list(raw) == ["hello", "world"]


def test_clean_bullet_list_caps_at_max_items() -> None:
    raw = [str(i) for i in range(20)]
    assert _clean_bullet_list(raw, max_items=3) == ["0", "1", "2"]


def test_clean_bullet_list_default_cap_is_five() -> None:
    raw = ["a", "b", "c", "d", "e", "f", "g"]
    assert _clean_bullet_list(raw) == ["a", "b", "c", "d", "e"]
