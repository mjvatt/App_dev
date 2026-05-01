import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    BOSS = "boss"


class Topic(StrEnum):
    ARRAYS = "arrays"
    STRINGS = "strings"
    LINKED_LISTS = "linked_lists"
    TREES = "trees"
    GRAPHS = "graphs"
    DYNAMIC_PROGRAMMING = "dynamic_programming"
    SYSTEM_DESIGN = "system_design"


@dataclass
class ChallengeData:
    id: str
    topic: Topic
    difficulty: Difficulty
    title: str
    prompt: str
    constraints: list[str] = field(default_factory=list)
    examples: list[dict[str, str]] = field(default_factory=list)


@dataclass
class AttemptResult:
    attempt_id: str
    passed: bool
    xp_earned: int
    feedback: str
    hints_used: int
    time_ms: int
    topic: Topic | None = None
    difficulty: Difficulty | None = None
    next_difficulty: Difficulty | None = None


@dataclass
class HintResult:
    hint: str
    hints_remaining: int


@dataclass
class ReviewResult:
    review: str
    available: bool = True


@dataclass
class ExplanationGrade:
    """Structured grade for a verbal-explanation transcript. Each
    dimension is 0-5 (0 = absent, 5 = excellent); overall is a 0-100
    composite that callers can render as a single number."""
    correctness: int
    clarity: int
    completeness: int
    communication: int
    overall: int
    feedback: str
    available: bool = True


@dataclass
class UserLevel:
    user_id: str
    total_xp: int
    level: int
    xp_to_next: int
    streak_days: int
    topics: dict[str, int] = field(default_factory=dict)


class GameEngine(ABC):
    @abstractmethod
    async def next_challenge(
        self,
        db: AsyncSession,
        user_id: str,
        topic: Topic | None = None,
        difficulty: Difficulty | None = None,
    ) -> ChallengeData: ...

    @abstractmethod
    async def evaluate_attempt(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        solution: str,
        time_ms: int = 0,
    ) -> AttemptResult: ...

    @abstractmethod
    async def generate_hint(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        current_attempt: str,
    ) -> HintResult: ...

    @abstractmethod
    async def get_challenge(
        self, db: AsyncSession, challenge_id: str
    ) -> ChallengeData | None: ...

    @abstractmethod
    async def get_daily_challenge(
        self, db: AsyncSession, on_date: datetime.date
    ) -> ChallengeData:
        """Deterministic daily-challenge selection. Must return the same
        ChallengeData for every caller on a given date so all users solve
        the same problem. Real engines hash the date against the full
        challenge bank; the stub returns its single challenge."""
        ...

    async def generate_review(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        solution: str,
        language: str,
    ) -> "ReviewResult":
        """Optional: generate a post-pass code review. Default is a no-op
        result so engines that don't support reviews still satisfy the
        interface. The real engine overrides with a Haiku call."""
        return ReviewResult(
            review="Code review is not available in this engine.",
            available=False,
        )

    async def grade_explanation(
        self,
        db: AsyncSession,
        user_id: str,
        challenge_id: str,
        solution: str,
        transcript: str,
    ) -> "ExplanationGrade":
        """Optional: grade a verbal-explanation transcript across four
        interview-style dimensions. Default is unavailable; HaikuEngine
        overrides with a real call."""
        return ExplanationGrade(
            correctness=0,
            clarity=0,
            completeness=0,
            communication=0,
            overall=0,
            feedback="Explanation grading is not available in this engine.",
            available=False,
        )

    async def get_challenges(
        self, db: AsyncSession, challenge_ids: list[str]
    ) -> dict[str, ChallengeData]:
        """Batch fetch. Override for engines backed by a real datastore;
        the default falls back to per-id lookups, which is fine for
        in-memory engines but N+1 for DB-backed ones."""
        result: dict[str, ChallengeData] = {}
        for cid in challenge_ids:
            challenge = await self.get_challenge(db, cid)
            if challenge is not None:
                result[cid] = challenge
        return result

    @abstractmethod
    async def get_user_level(self, user_id: str) -> UserLevel: ...
