from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_db
from api.models.challenge import Attempt, UserProgress
from api.models.user import User
from api.schemas.profile import PublicProfileResponse

router = APIRouter()


@router.get("/{username}", response_model=PublicProfileResponse)
async def get_public_profile(
    username: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicProfileResponse:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="profile_not_found")

    progress = await db.get(UserProgress, user.id)

    challenges_passed = await db.scalar(
        select(func.count(func.distinct(Attempt.challenge_id))).where(
            Attempt.user_id == user.id, Attempt.passed.is_(True)
        )
    ) or 0

    if progress is None:
        return PublicProfileResponse(
            username=user.username,
            level=1,
            total_xp=0,
            streak_days=0,
            daily_streak_days=0,
            longest_streak=0,
            longest_daily_streak=0,
            challenges_passed=challenges_passed,
            topics={},
        )

    return PublicProfileResponse(
        username=user.username,
        level=progress.level,
        total_xp=progress.total_xp,
        streak_days=progress.streak_days,
        daily_streak_days=progress.daily_streak_days,
        longest_streak=progress.longest_streak,
        longest_daily_streak=progress.longest_daily_streak,
        challenges_passed=challenges_passed,
        topics=progress.topics or {},
    )
