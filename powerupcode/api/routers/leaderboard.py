from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import UserProgress
from api.models.user import User
from api.schemas.leaderboard import LeaderboardEntry, LeaderboardResponse

router = APIRouter()

_LIMIT = 50
_DUMMY_THRESHOLD = 10


@dataclass(frozen=True)
class _DummyPlayer:
    username: str
    level: int
    total_xp: int
    streak_days: int


_DUMMY_PLAYERS: tuple[_DummyPlayer, ...] = (
    _DummyPlayer("kaito_dev", 8, 780, 14),
    _DummyPlayer("algo_queen", 7, 650, 9),
    _DummyPlayer("stackflow", 6, 540, 5),
    _DummyPlayer("neetcodex", 5, 420, 21),
    _DummyPlayer("dp_wizard", 4, 370, 3),
    _DummyPlayer("treecurser", 4, 310, 7),
    _DummyPlayer("hashmap_hero", 3, 250, 2),
    _DummyPlayer("grindset99", 3, 220, 12),
    _DummyPlayer("bfs_dfs_only", 2, 180, 1),
    _DummyPlayer("twopointers", 2, 130, 4),
)


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeaderboardResponse:
    result = await db.execute(
        select(
            UserProgress.user_id,
            UserProgress.level,
            UserProgress.total_xp,
            UserProgress.streak_days,
            User.username,
        )
        .join(User, User.id == UserProgress.user_id)
        .order_by(UserProgress.total_xp.desc())
        .limit(_LIMIT)
    )
    rows = result.all()

    entries: list[dict] = [
        {
            "username": row.username,
            "level": row.level,
            "total_xp": row.total_xp,
            "streak_days": row.streak_days,
            "is_current_user": row.user_id == user_id,
        }
        for row in rows
    ]

    if len(rows) < _DUMMY_THRESHOLD:
        real_usernames = {row.username for row in rows}
        for dummy in _DUMMY_PLAYERS:
            if dummy.username not in real_usernames:
                entries.append(
                    {
                        "username": dummy.username,
                        "level": dummy.level,
                        "total_xp": dummy.total_xp,
                        "streak_days": dummy.streak_days,
                        "is_current_user": False,
                    }
                )

    entries.sort(key=lambda e: e["total_xp"], reverse=True)
    entries = entries[:_LIMIT]

    return LeaderboardResponse(
        entries=[
            LeaderboardEntry(
                rank=i + 1,
                username=entry["username"],
                level=entry["level"],
                total_xp=entry["total_xp"],
                streak_days=entry["streak_days"],
                is_current_user=entry["is_current_user"],
            )
            for i, entry in enumerate(entries)
        ]
    )
