from pydantic import BaseModel

from services.engine.interface import Difficulty, Topic


class ChallengeResponse(BaseModel):
    id: str
    topic: Topic
    difficulty: Difficulty
    title: str
    prompt: str
    constraints: list[str]
    examples: list[dict[str, str]]


class AttemptRequest(BaseModel):
    solution: str
    time_ms: int = 0


class AttemptResponse(BaseModel):
    attempt_id: str
    passed: bool
    xp_earned: int
    feedback: str
    hints_used: int
    time_ms: int
    leveled_up: bool = False
    new_level: int = 1
    streak_days: int = 0
    streak_milestone: int | None = None  # one of 3, 7, 14, 30, 60, 100 when crossed


class HintRequest(BaseModel):
    current_attempt: str


class HintResponse(BaseModel):
    hint: str
    hints_remaining: int
