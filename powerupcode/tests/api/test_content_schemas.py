"""
Strict-validation tests for AI-generated challenge candidates.

These run against pure Pydantic — no Haiku call, no DB. The point is to
guarantee that bad model output gets rejected at the boundary instead
of writing junk to proposed_challenges.
"""
import pytest
from pydantic import ValidationError

from services.content.schemas import GeneratedChallenge, slugify


def _valid_payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "topic": "arrays",
        "difficulty": "easy",
        "title": "Two Sum",
        "prompt": (
            "Given an array of integers nums and an integer target, return "
            "indices of the two numbers such that they add up to target. "
            "Each input has exactly one solution; you may not use the same "
            "element twice."
        ),
        "constraints": ["2 <= nums.length <= 10000", "-10^9 <= nums[i] <= 10^9"],
        "examples": [
            {"input": "nums=[2,7,11,15], target=9", "output": "[0,1]"},
            {"input": "nums=[3,2,4], target=6", "output": "[1,2]"},
        ],
        "sample_solution": (
            "def solution(nums, target):\n"
            "    seen = {}\n"
            "    for i, n in enumerate(nums):\n"
            "        if target - n in seen:\n"
            "            return [seen[target - n], i]\n"
            "        seen[n] = i\n"
        ),
    }
    base.update(overrides)
    return base


def test_valid_payload_parses() -> None:
    challenge = GeneratedChallenge.model_validate(_valid_payload())
    assert challenge.title == "Two Sum"
    assert len(challenge.examples) == 2


def test_unknown_topic_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(topic="frontend"))


def test_unknown_difficulty_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(difficulty="trivial"))


def test_short_title_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(title="hi"))


def test_short_prompt_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(
            _valid_payload(prompt="too short")
        )


def test_zero_constraints_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(constraints=[]))


def test_blank_constraint_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(constraints=["   "]))


def test_one_example_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(
            _valid_payload(
                examples=[{"input": "x", "output": "y"}]
            )
        )


def test_too_many_examples_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(
            _valid_payload(
                examples=[{"input": str(i), "output": str(i)} for i in range(7)]
            )
        )


def test_example_missing_input_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(
            _valid_payload(
                examples=[
                    {"output": "1"},
                    {"input": "2", "output": "2"},
                ]
            )
        )


def test_empty_solution_rejected() -> None:
    with pytest.raises(ValidationError):
        GeneratedChallenge.model_validate(_valid_payload(sample_solution=""))


def test_slugify_basic() -> None:
    assert slugify("Two Sum") == "two-sum"


def test_slugify_strips_punctuation() -> None:
    assert slugify("Median of Two Sorted Arrays!") == "median-of-two-sorted-arrays"


def test_slugify_collapses_runs() -> None:
    assert slugify("Trapping  Rain   Water") == "trapping-rain-water"


def test_slugify_handles_existing_dashes() -> None:
    assert slugify("BFS--Traversal -- Graph") == "bfs-traversal-graph"
