from datetime import datetime

from pydantic import BaseModel


class DifficultyStats(BaseModel):
    attempts: int
    passed: int
    pass_rate: float


class UserProgressResponse(BaseModel):
    user_id: str
    total_xp: int
    level: int
    xp_to_next: int
    streak_days: int
    daily_streak_days: int = 0
    longest_streak: int = 0
    longest_daily_streak: int = 0
    token_balance: int = 0
    streak_shields: int = 0
    topics: dict[str, int]
    difficulty_stats: dict[str, DifficultyStats]


class StreakShieldResponse(BaseModel):
    """Returned after a successful shield purchase. Includes the new
    inventory + balance so the client doesn't need a follow-up GET."""
    streak_shields: int
    token_balance: int


class AttemptHistoryItem(BaseModel):
    attempt_id: str
    challenge_id: str
    challenge_title: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    passed: bool
    xp_earned: int
    hints_used: int
    time_ms: int
    submitted_at: datetime


class AttemptHistoryResponse(BaseModel):
    items: list[AttemptHistoryItem]
