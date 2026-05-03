from pydantic import BaseModel


class PublicProfileResponse(BaseModel):
    """Public-facing snapshot of a user's progress. Surfaced at
    /api/profiles/{username}; safe to render to anonymous viewers."""

    username: str
    level: int
    total_xp: int
    streak_days: int
    daily_streak_days: int
    longest_streak: int
    longest_daily_streak: int
    challenges_passed: int
    topics: dict[str, int]
