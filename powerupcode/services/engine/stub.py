"""
Stub engine for local development and CI.
Daily challenge: returns the single stub problem regardless of date.
All evaluation and hint logic returns placeholder responses.
Replace at runtime by setting ENGINE_MODULE in the environment.

The stub ignores its `db` parameter — the in-memory bank has exactly
one challenge, so no DB read is needed. Production engines route the
session through ChallengeRepository instead.

NOTE: Transient state (the user's last-fetched difficulty per challenge)
is held in a per-process dict. This is fine for single-worker dev and CI;
under multi-worker production, a user that fetches on worker A and submits
on worker B will fall back to the challenge's default difficulty. The
production engine_core is responsible for persisting any state that needs
to survive across requests or workers.
"""
import datetime
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

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
    def __init__(self) -> None:
        # Keyed by (user_id, challenge_id) so concurrent users don't clobber
        # each other on the same challenge. Still per-process state — see
        # the module docstring.
        self._last_difficulty: dict[tuple[str, str], Difficulty] = {}

    async def next_challenge(
        self,
        db: AsyncSession,
        user_id: str,
        topic: Topic | None = None,
        difficulty: Difficulty | None = None,
    ) -> ChallengeData:
        diff = difficulty or _STUB_CHALLENGE.difficulty
        self._last_difficulty[(user_id, _STUB_CHALLENGE.id)] = diff
        return ChallengeData(
            id=_STUB_CHALLENGE.id,
            topic=topic or _STUB_CHALLENGE.topic,
            difficulty=diff,
            title=_STUB_CHALLENGE.title,
            prompt=_STUB_CHALLENGE.prompt,
            constraints=_STUB_CHALLENGE.constraints,
            examples=_STUB_CHALLENGE.examples,
        )

    async def evaluate_attempt(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        solution: str,
        time_ms: int = 0,
    ) -> AttemptResult:
        diff = self._last_difficulty.get(
            (user_id, challenge_id), _STUB_CHALLENGE.difficulty
        )
        return AttemptResult(
            attempt_id=str(uuid.uuid4()),
            passed=False,
            xp_earned=0,
            feedback="Evaluation is not available in stub mode.",
            hints_used=0,
            time_ms=time_ms,
            topic=_STUB_CHALLENGE.topic,
            difficulty=diff,
        )

    async def generate_hint(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        current_attempt: str,
    ) -> HintResult:
        return HintResult(hint="Hints are not available in stub mode.", hints_remaining=0)

    async def get_challenge(
        self, db: AsyncSession, challenge_id: str
    ) -> ChallengeData | None:
        if challenge_id == _STUB_CHALLENGE.id:
            return _STUB_CHALLENGE
        return None

    async def get_daily_challenge(
        self, db: AsyncSession, on_date: datetime.date
    ) -> ChallengeData:
        return _STUB_CHALLENGE

    async def get_user_level(self, user_id: str) -> UserLevel:
        return UserLevel(
            user_id=user_id,
            total_xp=0,
            level=1,
            xp_to_next=100,
            streak_days=0,
            topics={t.value: 0 for t in Topic},
        )
