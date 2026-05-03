from datetime import datetime

from pydantic import BaseModel

from api.schemas.challenge import ChallengeResponse


class InterviewStartRequest(BaseModel):
    topic: str | None = None
    difficulty: str | None = None
    multi_stage: bool = False


class InterviewEndRequest(BaseModel):
    solution: str
    transcript: str = ""
    language: str = "python"
    time_ms: int = 0


class InterviewStageResponse(BaseModel):
    """One stage in a multi-stage interview run. Active stage carries the
    challenge body; completed stages carry per-stage post-mortem fields."""
    stage_index: int
    label: str  # 'warmup' | 'main' | 'follow_up'
    status: str  # pending | in_progress | completed
    challenge: ChallengeResponse
    overall_score: int | None
    feedback: str | None
    strengths: list[str]
    improvements: list[str]
    time_ms: int | None
    time_freezes_used: int


class InterviewSessionResponse(BaseModel):
    """Full session state. Active sessions populate challenge + status;
    completed sessions also populate the post-mortem fields. Multi-stage
    sessions populate `stages` and `current_stage_index`; single-stage
    sessions leave `stages` empty for backward compatibility."""
    id: str
    status: str  # in_progress | completed | abandoned
    challenge: ChallengeResponse
    topic: str | None
    difficulty: str | None
    started_at: datetime
    ended_at: datetime | None
    # Post-mortem fields — null until status == 'completed'.
    # On multi-stage runs these are the aggregate over stages.
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
    # Multi-stage support — empty list + None for legacy single-stage
    # rows so existing clients keep working unchanged.
    is_multi_stage: bool = False
    current_stage_index: int | None = None
    stages: list[InterviewStageResponse] = []


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
