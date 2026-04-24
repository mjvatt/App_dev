from pydantic import BaseModel


class UserProgressResponse(BaseModel):
    user_id: str
    total_xp: int
    level: int
    xp_to_next: int
    streak_days: int
    topics: dict[str, int]
