"""
Stub engine for local development and CI.
All evaluation and hint logic returns placeholder responses.
Replace at runtime by setting ENGINE_MODULE in the environment.
"""
import uuid
from typing import Optional

from services.engine.interface import (
    AttemptResult,
    ChallengeData,
    Difficulty,
    GameEngine,
    HintResult,
    Topic,
    UserLevel,
)

_STUB_CHALLENGE = ChallengeData(
    id="stub-001",
    topic=Topic.ARRAYS,
    difficulty=Difficulty.EASY,
    title="Two Sum",
    prompt=(
        "Given an array of integers nums and an integer target, "
        "return indices of the two numbers such that they add up to target."
    ),
    constraints=[
        "2 <= nums.length <= 10^4",
        "-10^9 <= nums[i] <= 10^9",
        "Each input has exactly one solution.",
    ],
    examples=[
        {"input": "nums = [2, 7, 11, 15], target = 9", "output": "[0, 1]"},
        {"input": "nums = [3, 2, 4], target = 6", "output": "[1, 2]"},
    ],
)


class StubEngine(GameEngine):
    async def next_challenge(
        self,
        user_id: str,
        topic: Optional[Topic] = None,
        difficulty: Optional[Difficulty] = None,
    ) -> ChallengeData:
        return ChallengeData(
            id=_STUB_CHALLENGE.id,
            topic=topic or _STUB_CHALLENGE.topic,
            difficulty=difficulty or _STUB_CHALLENGE.difficulty,
            title=_STUB_CHALLENGE.title,
            prompt=_STUB_CHALLENGE.prompt,
            constraints=_STUB_CHALLENGE.constraints,
            examples=_STUB_CHALLENGE.examples,
        )

    async def evaluate_attempt(
        self,
        user_id: str,
        challenge_id: str,
        solution: str,
        time_ms: int = 0,
    ) -> AttemptResult:
        return AttemptResult(
            attempt_id=str(uuid.uuid4()),
            passed=False,
            xp_earned=0,
            feedback="Evaluation is not available in stub mode.",
            hints_used=0,
            time_ms=time_ms,
        )

    async def generate_hint(
        self,
        user_id: str,
        challenge_id: str,
        current_attempt: str,
    ) -> HintResult:
        return HintResult(hint="Hints are not available in stub mode.", hints_remaining=0)

    async def get_user_level(self, user_id: str) -> UserLevel:
        return UserLevel(
            user_id=user_id,
            total_xp=0,
            level=1,
            xp_to_next=100,
            streak_days=0,
            topics={t.value: 0 for t in Topic},
        )
