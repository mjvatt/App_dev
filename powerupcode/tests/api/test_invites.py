"""Pure-logic tests for services.invites helpers."""
from __future__ import annotations

import pytest

from services.invites import (
    MAX_CODE_LENGTH,
    MIN_CODE_LENGTH,
    generate_code,
    is_valid_code_format,
    normalize_code,
)


class TestNormalizeCode:
    def test_uppercases_lowercase_input(self) -> None:
        assert normalize_code("abcd-1234") == "ABCD-1234"

    def test_trims_whitespace(self) -> None:
        assert normalize_code("  abcd  ") == "ABCD"

    def test_strips_surrounding_hyphens_but_preserves_internal(self) -> None:
        assert normalize_code("-FRIENDS-2026-") == "FRIENDS-2026"

    def test_is_idempotent(self) -> None:
        once = normalize_code("friends-2026")
        twice = normalize_code(once)
        assert once == twice


class TestIsValidCodeFormat:
    @pytest.mark.parametrize("code", ["ABCD", "FRIENDS-2026", "A" * MAX_CODE_LENGTH])
    def test_accepts_well_formed_codes(self, code: str) -> None:
        assert is_valid_code_format(code) is True

    def test_accepts_mixed_case_via_normalization(self) -> None:
        assert is_valid_code_format("Friends-2026") is True

    def test_rejects_too_short(self) -> None:
        assert is_valid_code_format("ABC") is False

    def test_rejects_too_long(self) -> None:
        assert is_valid_code_format("A" * (MAX_CODE_LENGTH + 1)) is False

    @pytest.mark.parametrize("code", ["abcd!", "ABCD 2026", "code_with_underscore", "ABCD.2026"])
    def test_rejects_disallowed_characters(self, code: str) -> None:
        assert is_valid_code_format(code) is False

    def test_rejects_empty(self) -> None:
        assert is_valid_code_format("") is False


class TestGenerateCode:
    def test_default_length_is_at_least_min(self) -> None:
        assert len(generate_code()) >= MIN_CODE_LENGTH

    def test_output_is_valid_format(self) -> None:
        for _ in range(20):
            assert is_valid_code_format(generate_code()) is True

    def test_excludes_ambiguous_characters(self) -> None:
        for _ in range(50):
            code = generate_code()
            for ch in code:
                assert ch not in "01OI", f"ambiguous char in generated code: {code}"

    def test_prefix_is_prepended_and_uppercased(self) -> None:
        code = generate_code(prefix="friends")
        assert code.startswith("FRIENDS-")
        assert is_valid_code_format(code) is True

    def test_prefix_rejected_when_empty_after_normalization(self) -> None:
        with pytest.raises(ValueError):
            generate_code(prefix="---")

    def test_prefix_rejected_when_contains_disallowed_chars(self) -> None:
        with pytest.raises(ValueError):
            generate_code(prefix="bad prefix")

    def test_length_below_min_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            generate_code(length=MIN_CODE_LENGTH - 1)

    def test_generated_codes_are_not_repeated(self) -> None:
        codes = {generate_code() for _ in range(50)}
        # 32^10 alphabet space — collisions across 50 draws are astronomically
        # unlikely; treat any collision as a regression in randomness.
        assert len(codes) == 50
