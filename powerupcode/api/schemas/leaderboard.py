from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    level: int
    total_xp: int
    streak_days: int
    is_current_user: bool


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
