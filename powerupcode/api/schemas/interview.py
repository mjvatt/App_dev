from datetime import datetime

from pydantic import BaseModel

from api.schemas.challenge import ChallengeResponse


class InterviewStartRequest(BaseModel):
    topic: str | None = None
    difficulty: str | None = None


class InterviewEndRequest(BaseModel):
    solution: str
    transcript: str = ""
    language: str = "python"
    time_ms: int = 0


class InterviewSessionResponse(BaseModel):
    """Full session state. Active sessions populate challenge + status;
    completed sessions also populate the post-mortem fields."""
    id: str
    status: str  # in_progress | completed | abandoned
    challenge: ChallengeResponse
    topic: str | None
    difficulty: str | None
    started_at: datetime
    ended_at: datetime | None
    # Post-mortem fields — null until status == 'completed'
    overall_score: int | None
    feedback: str | None
    strengths: list[str]
    improvements: list[str]
    time_ms: int | None
    # Tokens granted on the first /end transition only. Idempotent
    # re-fetches return 0 since the grant has already been applied.
    tokens_earned: int = 0
    # Cumulative count of time-freeze power-ups spent on this session.
    # Frontend extends the soft target by N * 5 min.
    time_freezes_used: int = 0


class InterviewHistoryItem(BaseModel):
    """Compact summary for the history list. Skips the challenge body
    so the list stays light; clients fetch full sessions on demand."""
    id: str
    status: str
    challenge_id: str
    challenge_title: str | None
    topic: str | None
    difficulty: str | None
    overall_score: int | None
    started_at: datetime
    ended_at: datetime | None


class InterviewHistoryResponse(BaseModel):
    items: list[InterviewHistoryItem]
