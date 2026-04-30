"""
Strict validation for AI-generated challenge candidates.

Whatever the model returns gets validated against this schema before it
ever lands in the proposed_challenges table. Bad output is rejected at
the boundary, not silently stored.
"""
import re
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from services.engine.interface import Difficulty, Topic

_TITLE_MIN = 5
_TITLE_MAX = 80
_PROMPT_MIN = 50
_PROMPT_MAX = 4000
_MIN_CONSTRAINTS = 1
_MIN_EXAMPLES = 2
_MAX_EXAMPLES = 6


class GeneratedExample(BaseModel):
    input: Annotated[str, Field(min_length=1, max_length=2000)]
    output: Annotated[str, Field(min_length=1, max_length=2000)]


class GeneratedChallenge(BaseModel):
    """The exact shape an AI generator must produce."""

    topic: Topic
    difficulty: Difficulty
    title: Annotated[str, Field(min_length=_TITLE_MIN, max_length=_TITLE_MAX)]
    prompt: Annotated[str, Field(min_length=_PROMPT_MIN, max_length=_PROMPT_MAX)]
    constraints: list[str]
    examples: list[GeneratedExample]
    sample_solution: Annotated[str, Field(min_length=10, max_length=8000)]

    @field_validator("constraints")
    @classmethod
    def _constraints_nonempty(cls, v: list[str]) -> list[str]:
        if len(v) < _MIN_CONSTRAINTS:
            raise ValueError(f"need at least {_MIN_CONSTRAINTS} constraint")
        for item in v:
            if not item.strip():
                raise ValueError("constraint entries must be non-empty strings")
        return v

    @field_validator("examples")
    @classmethod
    def _examples_in_range(cls, v: list[GeneratedExample]) -> list[GeneratedExample]:
        if not (_MIN_EXAMPLES <= len(v) <= _MAX_EXAMPLES):
            raise ValueError(
                f"need {_MIN_EXAMPLES}-{_MAX_EXAMPLES} examples, got {len(v)}"
            )
        return v


def slugify(text: str) -> str:
    """Lowercase, ASCII-safe slug for challenge IDs.
    'Two Sum: Find Pair' -> 'two-sum-find-pair'."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", "", text).strip().lower()
    cleaned = re.sub(r"[\s-]+", "-", cleaned)
    return cleaned.strip("-")
