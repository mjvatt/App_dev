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
    daily_streak_days: int = 0
    daily_streak_milestone: int | None = None  # one of 3, 7, 14, 30, 100, 365 when crossed


class HintRequest(BaseModel):
    current_attempt: str


class HintResponse(BaseModel):
    hint: str
    hints_remaining: int


class ReviewRequest(BaseModel):
    solution: str
    language: str


class ReviewResponse(BaseModel):
    review: str
    available: bool


class PersonalBestResponse(BaseModel):
    """Per-user fastest passing time on a challenge. Powers the
    timer / PB chase UI in Quick Play."""
    best_time_ms: int | None
    pass_count: int  # how many times the user has passed this challenge


class ExplanationRequest(BaseModel):
    solution: str
    transcript: str


class ExplanationResponse(BaseModel):
    correctness: int
    clarity: int
    completeness: int
    communication: int
    overall: int
    feedback: str
    available: bool


class DailyStatusResponse(BaseModel):
    """Per-user state for today's daily, returned alongside the challenge."""
    solved: bool
    time_ms: int | None
    rank: int | None  # 1-based among today's solvers; None if not solved


class DailyChallengeResponse(BaseModel):
    challenge: ChallengeResponse
    status: DailyStatusResponse


class DailyLeaderboardEntry(BaseModel):
    rank: int
    username: str
    time_ms: int
    is_current_user: bool


class DailyLeaderboardResponse(BaseModel):
    entries: list[DailyLeaderboardEntry]
    total_solvers: int
