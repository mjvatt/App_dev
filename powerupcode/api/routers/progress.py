from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import Attempt, UserProgress
from api.schemas.progress import AttemptHistoryItem, AttemptHistoryResponse, UserProgressResponse
from services.engine import get_engine

router = APIRouter()

_XP_PER_LEVEL = 100
_HISTORY_LIMIT = 20


@router.get("/me", response_model=UserProgressResponse)
async def get_my_progress(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserProgressResponse:
    progress = await db.get(UserProgress, user_id)
    if progress is None:
        return UserProgressResponse(
            user_id=user_id,
            total_xp=0,
            level=1,
            xp_to_next=_XP_PER_LEVEL,
            streak_days=0,
            topics={},
        )
    return UserProgressResponse(
        user_id=progress.user_id,
        total_xp=progress.total_xp,
        level=progress.level,
        xp_to_next=_XP_PER_LEVEL - (progress.total_xp % _XP_PER_LEVEL),
        streak_days=progress.streak_days,
        topics=progress.topics or {},
    )


@router.get("/history", response_model=AttemptHistoryResponse)
async def get_my_history(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttemptHistoryResponse:
    result = await db.execute(
        select(Attempt)
        .where(Attempt.user_id == user_id)
        .order_by(Attempt.submitted_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    attempts = result.scalars().all()

    engine = get_engine()
    items: list[AttemptHistoryItem] = []
    for attempt in attempts:
        challenge = await engine.get_challenge(attempt.challenge_id)
        items.append(
            AttemptHistoryItem(
                attempt_id=attempt.id,
                challenge_id=attempt.challenge_id,
                challenge_title=challenge.title if challenge else None,
                topic=challenge.topic.value if challenge else None,
                difficulty=challenge.difficulty.value if challenge else None,
                passed=attempt.passed,
                xp_earned=attempt.xp_earned,
                hints_used=attempt.hints_used,
                time_ms=attempt.time_ms,
                submitted_at=attempt.submitted_at,
            )
        )

    return AttemptHistoryResponse(items=items)
