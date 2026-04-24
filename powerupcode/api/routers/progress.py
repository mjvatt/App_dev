from typing import Annotated

from fastapi import APIRouter, Depends

from api.dependencies import get_current_user
from api.schemas.progress import UserProgressResponse
from services.engine import get_engine

router = APIRouter()


@router.get("/me", response_model=UserProgressResponse)
async def get_my_progress(
    user_id: Annotated[str, Depends(get_current_user)],
) -> UserProgressResponse:
    level = await get_engine().get_user_level(user_id)
    return UserProgressResponse(
        user_id=level.user_id,
        total_xp=level.total_xp,
        level=level.level,
        xp_to_next=level.xp_to_next,
        streak_days=level.streak_days,
        topics=level.topics,
    )
