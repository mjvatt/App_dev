from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import UserProgress
from api.schemas.progress import UserProgressResponse

router = APIRouter()

_XP_PER_LEVEL = 100


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
        topics={},
    )
