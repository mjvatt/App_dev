from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    BOSS = "boss"


class Topic(str, Enum):
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
    examples: list[dict] = field(default_factory=list)  # type: ignore[type-arg]


@dataclass
class AttemptResult:
    attempt_id: str
    passed: bool
    xp_earned: int
    feedback: str
    hints_used: int
    time_ms: int
    topic: Optional[Topic] = None
    next_difficulty: Optional[Difficulty] = None


@dataclass
class HintResult:
    hint: str
    hints_remaining: int


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
        user_id: str,
        topic: Optional[Topic] = None,
        difficulty: Optional[Difficulty] = None,
    ) -> ChallengeData: ...

    @abstractmethod
    async def evaluate_attempt(
        self,
        user_id: str,
        challenge_id: str,
        solution: str,
        time_ms: int = 0,
    ) -> AttemptResult: ...

    @abstractmethod
    async def generate_hint(
        self,
        user_id: str,
        challenge_id: str,
        current_attempt: str,
    ) -> HintResult: ...

    @abstractmethod
    async def get_challenge(self, challenge_id: str) -> Optional[ChallengeData]: ...

    @abstractmethod
    async def get_user_level(self, user_id: str) -> UserLevel: ...
