from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import Attempt
from services.curriculum.recommender import AttemptSummary, recommend
from services.engine import get_engine
from services.engine.interface import Difficulty, Topic

router = APIRouter()

_RECENT_ATTEMPTS = 50


class CurriculumResponse(BaseModel):
    weak_topic: Topic
    suggested_difficulty: Difficulty
    rationale: str
    pass_count: int
    total_attempts: int


@router.get("/me", response_model=CurriculumResponse)
async def get_curriculum_for_me(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurriculumResponse:
    """Return a personalized topic + difficulty recommendation based on
    the user's last 50 attempts. Pure logic in services.curriculum;
    this route only loads attempts and resolves challenge -> topic
    mappings via the engine."""
    rows = (
        await db.execute(
            select(Attempt)
            .where(Attempt.user_id == user_id)
            .order_by(Attempt.submitted_at.desc())
            .limit(_RECENT_ATTEMPTS)
        )
    ).scalars().all()

    engine = get_engine()
    challenge_ids = list({row.challenge_id for row in rows})
    challenges = await engine.get_challenges(challenge_ids) if challenge_ids else {}

    summaries: list[AttemptSummary] = []
    for row in rows:
        challenge = challenges.get(row.challenge_id)
        if challenge is None:
            continue  # challenge_id no longer in the bank — skip it
        diff_value = row.difficulty
        try:
            difficulty = Difficulty(diff_value) if diff_value else challenge.difficulty
        except ValueError:
            difficulty = challenge.difficulty
        summaries.append(
            AttemptSummary(
                topic=challenge.topic,
                difficulty=difficulty,
                passed=row.passed,
            )
        )

    rec = recommend(summaries)
    return CurriculumResponse(
        weak_topic=rec.weak_topic,
        suggested_difficulty=rec.suggested_difficulty,
        rationale=rec.rationale,
        pass_count=rec.pass_count,
        total_attempts=rec.total_attempts,
    )
