from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import Attempt, UserProgress
from api.schemas.challenge import (
    AttemptRequest,
    AttemptResponse,
    ChallengeResponse,
    HintRequest,
    HintResponse,
)
from services.engine import get_engine
from services.engine.interface import Difficulty, Topic

router = APIRouter()


def _compute_level(total_xp: int) -> int:
    return total_xp // 100 + 1


def _update_streak(progress: UserProgress) -> None:
    today = date.today()
    if progress.last_active is None:
        progress.streak_days = 1
    else:
        delta = (today - progress.last_active.date()).days  # type: ignore[union-attr]
        if delta == 1:
            progress.streak_days += 1
        elif delta > 1:
            progress.streak_days = 1
    progress.last_active = datetime.now(timezone.utc)


@router.get("/next", response_model=ChallengeResponse)
async def get_next_challenge(
    user_id: Annotated[str, Depends(get_current_user)],
    topic: Topic | None = None,
    difficulty: Difficulty | None = None,
) -> ChallengeResponse:
    challenge = await get_engine().next_challenge(user_id, topic, difficulty)
    return ChallengeResponse(
        id=challenge.id,
        topic=challenge.topic,
        difficulty=challenge.difficulty,
        title=challenge.title,
        prompt=challenge.prompt,
        constraints=challenge.constraints,
        examples=challenge.examples,
    )


@router.post("/{challenge_id}/attempt", response_model=AttemptResponse)
async def submit_attempt(
    challenge_id: str,
    body: AttemptRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttemptResponse:
    result = await get_engine().evaluate_attempt(user_id, challenge_id, body.solution, body.time_ms)

    attempt = Attempt(
        user_id=user_id,
        challenge_id=challenge_id,
        passed=result.passed,
        xp_earned=result.xp_earned,
        hints_used=result.hints_used,
        time_ms=result.time_ms,
    )
    db.add(attempt)

    progress = await db.get(UserProgress, user_id)
    if progress is None:
        progress = UserProgress(user_id=user_id, total_xp=result.xp_earned)
        db.add(progress)
    else:
        progress.total_xp += result.xp_earned

    progress.level = _compute_level(progress.total_xp)
    _update_streak(progress)
    await db.commit()

    return AttemptResponse(
        attempt_id=attempt.id,
        passed=result.passed,
        xp_earned=result.xp_earned,
        feedback=result.feedback,
        hints_used=result.hints_used,
        time_ms=result.time_ms,
    )


@router.post("/{challenge_id}/hint", response_model=HintResponse)
async def request_hint(
    challenge_id: str,
    body: HintRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> HintResponse:
    hint = await get_engine().generate_hint(user_id, challenge_id, body.current_attempt)
    return HintResponse(hint=hint.hint, hints_remaining=hint.hints_remaining)
