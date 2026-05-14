"""Pure helpers for invite-code formatting and generation.

Database I/O (redemption) lives in the register endpoint; this module
deliberately holds no SQLAlchemy imports so it stays unit-testable
without a database fixture.
"""
from __future__ import annotations

import secrets

_ALLOWED_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")
MIN_CODE_LENGTH = 4
MAX_CODE_LENGTH = 64

_GENERATE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_DEFAULT_GENERATE_LENGTH = 10


def normalize_code(code: str) -> str:
    """Uppercase, trim whitespace, strip surrounding hyphens.
    Internal hyphens preserved (e.g. 'FRIENDS-2026-A1' stays as-is)."""
    return code.strip().upper().strip("-")


def is_valid_code_format(code: str) -> bool:
    normalized = normalize_code(code)
    if not MIN_CODE_LENGTH <= len(normalized) <= MAX_CODE_LENGTH:
        return False
    return all(c in _ALLOWED_CHARS for c in normalized)


def generate_code(prefix: str | None = None, length: int = _DEFAULT_GENERATE_LENGTH) -> str:
    """Generate a random code using an unambiguous alphabet (no 0/O/1/I).

    If a prefix is given it is prepended verbatim after normalization,
    separated by a hyphen. The random suffix length is the `length`
    argument; the total length (including prefix + hyphen) must fit
    inside MAX_CODE_LENGTH.
    """
    if length < MIN_CODE_LENGTH:
        raise ValueError(f"length must be >= {MIN_CODE_LENGTH}")
    suffix = "".join(secrets.choice(_GENERATE_ALPHABET) for _ in range(length))
    if prefix:
        normalized_prefix = normalize_code(prefix)
        if not normalized_prefix:
            raise ValueError("prefix is empty after normalization")
        if not all(c in _ALLOWED_CHARS for c in normalized_prefix):
            raise ValueError("prefix contains characters outside [A-Z0-9-]")
        code = f"{normalized_prefix}-{suffix}"
    else:
        code = suffix
    if len(code) > MAX_CODE_LENGTH:
        raise ValueError(f"generated code exceeds MAX_CODE_LENGTH ({MAX_CODE_LENGTH})")
    return code
