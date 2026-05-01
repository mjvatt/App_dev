from typing import Literal

from pydantic import BaseModel, Field

Branch = Literal["army", "marines", "navy", "air_force", "space_force", "coast_guard"]
Component = Literal["active", "reserve", "national_guard"]
EducationLevel = Literal[
    "high_school", "some_college", "associate", "bachelor", "master", "doctorate"
]
WorkStyle = Literal["in_person", "hybrid", "remote", "no_preference"]


class RecommendRequest(BaseModel):
    branch: Branch
    component: Component
    occupation_code: str = Field(..., description="MOC/MOS/AFSC/Rate, e.g., 11B, 0311, IT, 1B0X1")
    pay_grade: str = Field(..., description="E-1..E-9, W-1..W-5, O-1..O-10")
    years_of_service: int = Field(..., ge=0, le=50)
    combat_deployments: int = Field(default=0, ge=0, le=20)
    leadership_roles: str | None = Field(
        default=None, description="Roles such as Squad Leader, Platoon Sergeant, Department Head."
    )
    additional_skills: str | None = Field(
        default=None,
        description="Specialty schools, skill identifiers, attachments, awards relevant to skills.",
    )

    education_level: EducationLevel
    certifications: str | None = Field(
        default=None, description="Civilian certifications already held (e.g., CDL, Sec+, PMP)."
    )
    civilian_skills: str | None = Field(
        default=None, description="Civilian skills picked up off-duty or before service."
    )

    location: str = Field(..., description="ZIP, city/state, or 'flexible'.")
    open_to_relocate: bool = False
    dependents: int = Field(default=0, ge=0, le=20)
    target_salary: int | None = Field(default=None, ge=0, description="Annual USD floor.")
    work_style: WorkStyle = "no_preference"

    goals: str | None = Field(
        default=None, description="What the veteran wants out of their next career."
    )


class Citation(BaseModel):
    source: str
    title: str
    url: str | None = None


class SkillGap(BaseModel):
    skill: str
    have: bool
    note: str | None = None


class ActionStep(BaseModel):
    label: str
    detail: str | None = None
    url: str | None = None


class Recommendation(BaseModel):
    soc_code: str
    title: str
    fit_score: float = Field(..., ge=0, le=1)
    rationale: str
    wage_range: str | None = Field(
        default=None, description="Wage range grounded in BLS OEWS for the user's geography."
    )
    open_postings: int | None = Field(
        default=None, description="Live count of relevant USAJobs postings, when available."
    )
    skill_gaps: list[SkillGap]
    action_steps: list[ActionStep]
    citations: list[Citation]


class RecommendResponse(BaseModel):
    recommendations: list[Recommendation]
    notes: str | None = None


class RewriteContext(BaseModel):
    branch: Branch | None = None
    occupation_code: str | None = None
    pay_grade: str | None = None
    target_role: str | None = Field(
        default=None,
        description="Target civilian role for tuning translation, e.g., 'Training Specialist'.",
    )


class RewriteRequest(BaseModel):
    bullets: list[str] = Field(..., min_length=1, max_length=20)
    context: RewriteContext | None = None


class RewriteItem(BaseModel):
    original: str
    rewritten: str
    notes: str | None = None


class RewriteResponse(BaseModel):
    rewrites: list[RewriteItem]
    notes: str | None = None
