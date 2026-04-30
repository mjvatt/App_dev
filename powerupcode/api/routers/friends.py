from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import UserProgress
from api.models.user import Friendship, User
from api.schemas.friends import (
    FriendLeaderboardEntry,
    FriendLeaderboardResponse,
    FriendRequestsResponse,
    FriendshipEntry,
    FriendshipRequestBody,
    FriendsListResponse,
    FriendUserSummary,
    UserSearchEntry,
    UserSearchResponse,
)
from api.schemas.user import MessageResponse

router = APIRouter()

_SEARCH_LIMIT = 10


async def _existing_relationship(
    db: AsyncSession, a: str, b: str
) -> Friendship | None:
    """Find a row connecting users a and b in either direction."""
    row: Friendship | None = await db.scalar(
        select(Friendship).where(
            or_(
                and_(Friendship.user_id == a, Friendship.friend_id == b),
                and_(Friendship.user_id == b, Friendship.friend_id == a),
            )
        )
    )
    return row


def _direction(row: Friendship, viewer_id: str) -> str:
    if row.status == "accepted":
        return "mutual"
    return "outgoing" if row.user_id == viewer_id else "incoming"


def _other_id(row: Friendship, viewer_id: str) -> str:
    return row.friend_id if row.user_id == viewer_id else row.user_id


async def _summarize_user(db: AsyncSession, user_id: str) -> FriendUserSummary | None:
    user = await db.get(User, user_id)
    if user is None:
        return None
    progress = await db.get(UserProgress, user_id)
    return FriendUserSummary(
        user_id=user.id,
        username=user.username,
        level=progress.level if progress else 1,
        total_xp=progress.total_xp if progress else 0,
        streak_days=progress.streak_days if progress else 0,
    )


@router.get("/search", response_model=UserSearchResponse)
async def search_users(
    q: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserSearchResponse:
    """Username prefix search. Excludes self. Surfaces up to 10 matches."""
    q = q.strip()
    if len(q) < 2:
        return UserSearchResponse(results=[])

    rows = (
        await db.execute(
            select(User.id, User.username)
            .where(
                User.username.ilike(f"{q}%"),
                User.id != user_id,
                User.is_active.is_(True),
            )
            .order_by(User.username.asc())
            .limit(_SEARCH_LIMIT)
        )
    ).all()
    return UserSearchResponse(
        results=[UserSearchEntry(user_id=row.id, username=row.username) for row in rows]
    )


@router.get("", response_model=FriendsListResponse)
async def list_friends(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendsListResponse:
    rows = (
        await db.execute(
            select(Friendship).where(
                or_(Friendship.user_id == user_id, Friendship.friend_id == user_id),
                Friendship.status == "accepted",
            )
        )
    ).scalars().all()

    entries: list[FriendshipEntry] = []
    for row in rows:
        other = await _summarize_user(db, _other_id(row, user_id))
        if other is None:
            continue
        entries.append(
            FriendshipEntry(
                friendship_id=row.id,
                status=row.status,
                direction="mutual",
                other=other,
                created_at=row.created_at,
            )
        )
    entries.sort(key=lambda e: e.other.total_xp, reverse=True)
    return FriendsListResponse(friends=entries)


@router.get("/requests", response_model=FriendRequestsResponse)
async def list_requests(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendRequestsResponse:
    rows = (
        await db.execute(
            select(Friendship).where(
                Friendship.status == "pending",
                or_(
                    Friendship.user_id == user_id,
                    Friendship.friend_id == user_id,
                ),
            )
        )
    ).scalars().all()

    incoming: list[FriendshipEntry] = []
    outgoing: list[FriendshipEntry] = []
    for row in rows:
        other = await _summarize_user(db, _other_id(row, user_id))
        if other is None:
            continue
        entry = FriendshipEntry(
            friendship_id=row.id,
            status=row.status,
            direction=_direction(row, user_id),
            other=other,
            created_at=row.created_at,
        )
        if entry.direction == "incoming":
            incoming.append(entry)
        else:
            outgoing.append(entry)
    return FriendRequestsResponse(incoming=incoming, outgoing=outgoing)


@router.post(
    "/request", response_model=MessageResponse, status_code=status.HTTP_201_CREATED
)
async def send_request(
    body: FriendshipRequestBody,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    target = await db.scalar(select(User).where(User.username == body.username))
    if target is None or not target.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")

    existing = await _existing_relationship(db, user_id, target.id)
    if existing is not None:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        raise HTTPException(status_code=400, detail="Request already pending")

    db.add(Friendship(user_id=user_id, friend_id=target.id, status="pending"))
    await db.commit()
    return MessageResponse(message="Friend request sent")


@router.post("/{friendship_id}/accept", response_model=MessageResponse)
async def accept_request(
    friendship_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    row = await db.get(Friendship, friendship_id)
    # Only the recipient can accept, and only while status is pending.
    if row is None or row.friend_id != user_id or row.status != "pending":
        raise HTTPException(status_code=404, detail="Request not found")
    row.status = "accepted"
    row.accepted_at = datetime.now(UTC)
    await db.commit()
    return MessageResponse(message="Friend request accepted")


@router.post("/{friendship_id}/decline", response_model=MessageResponse)
async def decline_request(
    friendship_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Either side can decline (the recipient says no, or the sender
    cancels their outgoing request) — but only on pending rows."""
    row = await db.get(Friendship, friendship_id)
    if (
        row is None
        or (row.friend_id != user_id and row.user_id != user_id)
        or row.status != "pending"
    ):
        raise HTTPException(status_code=404, detail="Request not found")
    await db.delete(row)
    await db.commit()
    return MessageResponse(message="Request removed")


@router.delete("/{other_user_id}", response_model=MessageResponse)
async def remove_friend(
    other_user_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    row = await _existing_relationship(db, user_id, other_user_id)
    if row is None or row.status != "accepted":
        raise HTTPException(status_code=404, detail="Friendship not found")
    await db.delete(row)
    await db.commit()
    return MessageResponse(message="Friend removed")


@router.get("/leaderboard", response_model=FriendLeaderboardResponse)
async def friends_leaderboard(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendLeaderboardResponse:
    """Leaderboard scoped to the user plus their accepted friends.
    Always includes the current user even if they have no friends yet,
    so the page never feels empty."""
    rows = (
        await db.execute(
            select(Friendship).where(
                Friendship.status == "accepted",
                or_(Friendship.user_id == user_id, Friendship.friend_id == user_id),
            )
        )
    ).scalars().all()

    user_ids = {user_id}
    for row in rows:
        user_ids.add(_other_id(row, user_id))

    result = await db.execute(
        select(
            UserProgress.user_id,
            UserProgress.level,
            UserProgress.total_xp,
            UserProgress.streak_days,
            User.username,
        )
        .join(User, User.id == UserProgress.user_id)
        .where(User.id.in_(user_ids))
        .order_by(UserProgress.total_xp.desc())
    )
    sorted_rows = result.all()

    # Users with no UserProgress row never enter the leaderboard, but the
    # current user is always shown even if zero XP — surface them with a
    # synthetic 0/0/0 entry.
    if user_id not in {row.user_id for row in sorted_rows}:
        me = await db.get(User, user_id)
        if me is not None:
            entries = [
                FriendLeaderboardEntry(
                    rank=len(sorted_rows) + 1,
                    username=me.username,
                    level=1,
                    total_xp=0,
                    streak_days=0,
                    is_current_user=True,
                )
            ]
        else:
            entries = []
        entries = [
            FriendLeaderboardEntry(
                rank=i + 1,
                username=row.username,
                level=row.level,
                total_xp=row.total_xp,
                streak_days=row.streak_days,
                is_current_user=row.user_id == user_id,
            )
            for i, row in enumerate(sorted_rows)
        ] + entries
    else:
        entries = [
            FriendLeaderboardEntry(
                rank=i + 1,
                username=row.username,
                level=row.level,
                total_xp=row.total_xp,
                streak_days=row.streak_days,
                is_current_user=row.user_id == user_id,
            )
            for i, row in enumerate(sorted_rows)
        ]

    return FriendLeaderboardResponse(entries=entries)
