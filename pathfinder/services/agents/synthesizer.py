from api.schemas import (
    Citation,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    SkillGap,
)


async def synthesize(request: RecommendRequest) -> RecommendResponse:
    # Placeholder synthesis. The agent pipeline (profile extraction, retrieval,
    # skill-gap analysis, ranking) is not yet wired up. The stub returns a
    # deterministic example so the HTTP surface and frontend can be exercised
    # end-to-end during scaffolding.
    _ = request
    return RecommendResponse(
        recommendations=[
            Recommendation(
                soc_code="33-3051.00",
                title="Police and Sheriff's Patrol Officers",
                fit_score=0.82,
                rationale=(
                    "Common transition for combat arms backgrounds: physical readiness, "
                    "team operations, and rules-of-engagement discipline transfer directly."
                ),
                skill_gaps=[
                    SkillGap(
                        skill="State POST certification",
                        have=False,
                        note="Required by most agencies; some honor military-skills bridge programs.",
                    ),
                    SkillGap(skill="Civilian use-of-force frameworks", have=False),
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
        notes="Stub response. Real synthesizer agent not yet wired up.",
    )
