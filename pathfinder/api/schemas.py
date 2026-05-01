from pydantic import BaseModel, Field


class RecommendRequest(BaseModel):
    moc: str = Field(..., description="Military Occupational Code (e.g., 11B, 25B, 68W).")
    background: str | None = Field(
        default=None,
        description="Optional free-text background: rank, time in service, interests, constraints.",
    )


class Citation(BaseModel):
    source: str
    title: str
    url: str | None = None


class SkillGap(BaseModel):
    skill: str
    have: bool
    note: str | None = None


class Recommendation(BaseModel):
    soc_code: str
    title: str
    fit_score: float = Field(..., ge=0, le=1)
    rationale: str
    skill_gaps: list[SkillGap]
    citations: list[Citation]


class RecommendResponse(BaseModel):
    recommendations: list[Recommendation]
    notes: str | None = None
