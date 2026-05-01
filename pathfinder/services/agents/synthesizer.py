from api.schemas import (
    ActionStep,
    Citation,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    SkillGap,
)


async def synthesize(request: RecommendRequest) -> RecommendResponse:
    # Placeholder synthesis. The real multi-stage pipeline (profile extraction,
    # retrieval over O*NET, BLS wage grounding, USAJobs lookup, personalized
    # ranking, action-plan generation) is not yet wired up. The stub echoes a
    # few request fields so end-to-end personalization signals can be eyeballed
    # before the agent layer lands.
    location_blurb = (
        f"in {request.location}" if request.location.lower() != "flexible" else "(flexible)"
    )
    salary_blurb = (
        f" Targeting ${request.target_salary:,}+." if request.target_salary else ""
    )
    leadership_blurb = (
        f" Leadership history: {request.leadership_roles}." if request.leadership_roles else ""
    )

    rationale = (
        f"{request.pay_grade} {request.branch.replace('_', ' ').title()} {request.occupation_code} "
        f"with {request.years_of_service} years of service{leadership_blurb} "
        f"{location_blurb}.{salary_blurb} "
        "Combat-arms backgrounds tend to map to law enforcement and federal protective roles, "
        "but the real ranking will incorporate your education level, civilian skills, and goals."
    )

    return RecommendResponse(
        recommendations=[
            Recommendation(
                soc_code="33-3051.00",
                title="Police and Sheriff's Patrol Officers",
                fit_score=0.82,
                rationale=rationale,
                wage_range=None,
                open_postings=None,
                skill_gaps=[
                    SkillGap(
                        skill="State POST certification",
                        have=False,
                        note="Required by most agencies; some honor military-skills bridge programs.",
                    ),
                    SkillGap(skill="Civilian use-of-force frameworks", have=False),
                ],
                action_steps=[
                    ActionStep(
                        label="Check your state's POST academy schedule",
                        detail="Academy length and entry requirements vary by state.",
                    ),
                    ActionStep(
                        label="Translate combat-arms bullets for civilian recruiters",
                        detail="Resume rewriter not yet wired up.",
                    ),
                ],
                citations=[
                    Citation(
                        source="O*NET",
                        title="33-3051.00 — Police and Sheriff's Patrol Officers",
                        url="https://www.onetonline.org/link/summary/33-3051.00",
                    ),
                ],
            ),
        ],
        notes=(
            "Stub response. Real synthesizer (O*NET retrieval + BLS wage grounding + "
            "USAJobs postings + personalized ranking + action plans) not yet wired up."
        ),
    )
