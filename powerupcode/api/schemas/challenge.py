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


class HintRequest(BaseModel):
    current_attempt: str


class HintResponse(BaseModel):
    hint: str
    hints_remaining: int
