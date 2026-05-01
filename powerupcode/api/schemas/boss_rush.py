from datetime import datetime

from pydantic import BaseModel

from api.schemas.challenge import ChallengeResponse


class BossRushAttemptRequest(BaseModel):
    solution: str
    time_ms: int = 0


class BossRushAttemptResponse(BaseModel):
    """Result of a single attempt within a run. Carries the updated
    run state so the frontend doesn't have to re-fetch."""
    passed: bool
    feedback: str
    status: str  # in_progress | completed | wiped
    current_index: int
    lives_remaining: int
    attempts_total: int
    xp_awarded: int | None
    next_challenge: ChallengeResponse | None  # null when run terminated


class BossRushSessionResponse(BaseModel):
    """Full run snapshot. current_challenge is the active problem when
    in_progress; null when completed or wiped."""
    id: str
    status: str
    current_index: int
    lives_remaining: int
    attempts_total: int
    xp_awarded: int | None
    current_challenge: ChallengeResponse | None
    challenge_ids: list[str]
    started_at: datetime
    ended_at: datetime | None


class BossRushHistoryItem(BaseModel):
    id: str
    status: str
    current_index: int
    lives_remaining: int
    xp_awarded: int | None
    started_at: datetime
    ended_at: datetime | None


class BossRushHistoryResponse(BaseModel):
    items: list[BossRushHistoryItem]
