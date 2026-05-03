from datetime import UTC, datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db, require_verified_user
from api.models.challenge import Attempt, TokenGift, UserProgress
from api.models.user import Friendship, User
from api.schemas.progress import (
    AttemptHistoryItem,
    AttemptHistoryResponse,
    DifficultyStats,
    StreakShieldResponse,
    TokenGiftRequest,
    TokenGiftResponse,
    UserProgressResponse,
)
from services.engine import get_engine
from services.tokens import (
    MAX_DAILY_STREAK_SHIELDS,
    MAX_GIFT_TOKENS,
    MAX_GIFTS_PER_DAY_PER_RECIPIENT,
    MIN_GIFT_TOKENS,
    TOKENS_DAILY_STREAK_SHIELD,
)

router = APIRouter()

_XP_PER_LEVEL = 100
_HISTORY_LIMIT = 20


@router.get("/me", response_model=UserProgressResponse)
async def get_my_progress(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserProgressResponse:
    progress = await db.get(UserProgress, user_id)

    diff_result = await db.execute(
        select(
            Attempt.difficulty,
            func.count().label("attempts"),
            func.sum(case((Attempt.passed.is_(True), 1), else_=0)).label("passed"),
        )
        .where(Attempt.user_id == user_id, Attempt.difficulty.isnot(None))
        .group_by(Attempt.difficulty)
    )
    difficulty_stats: dict[str, DifficultyStats] = {
        row.difficulty: DifficultyStats(
            attempts=row.attempts,
            passed=row.passed,
            pass_rate=row.passed / row.attempts if row.attempts > 0 else 0.0,
        )
        for row in diff_result.all()
    }

    if progress is None:
        return UserProgressResponse(
            user_id=user_id,
            total_xp=0,
            level=1,
            xp_to_next=_XP_PER_LEVEL,
            streak_days=0,
            topics={},
            difficulty_stats=difficulty_stats,
        )
    return UserProgressResponse(
        user_id=progress.user_id,
        total_xp=progress.total_xp,
        level=progress.level,
        xp_to_next=_XP_PER_LEVEL - (progress.total_xp % _XP_PER_LEVEL),
        streak_days=progress.streak_days,
        daily_streak_days=progress.daily_streak_days,
        longest_streak=progress.longest_streak,
        longest_daily_streak=progress.longest_daily_streak,
        token_balance=progress.token_balance,
        streak_shields=progress.streak_shields,
        topics=progress.topics or {},
        difficulty_stats=difficulty_stats,
    )


@router.post("/daily-streak/shield", response_model=StreakShieldResponse)
async def buy_streak_shield(
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreakShieldResponse:
    """Spend tokens to add one streak shield to inventory. Capped per
    user; surplus purchases 409 instead of silently no-op'ing so the
    client can show a clear 'inventory full' message rather than just
    deducting tokens that disappear."""
    progress = await db.get(UserProgress, user_id)
    if progress is None:
        # No progress row means no balance to spend. Cheaper to 402 here
        # than to fabricate one and try to deduct from zero.
        raise HTTPException(
            status_code=402,
            detail=f"Need {TOKENS_DAILY_STREAK_SHIELD} tokens (balance 0).",
        )
    if progress.streak_shields >= MAX_DAILY_STREAK_SHIELDS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Already at the {MAX_DAILY_STREAK_SHIELDS}-shield cap. "
                "Use one before buying more."
            ),
        )
    if progress.token_balance < TOKENS_DAILY_STREAK_SHIELD:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Need {TOKENS_DAILY_STREAK_SHIELD} tokens "
                f"(balance {progress.token_balance})."
            ),
        )
    progress.token_balance -= TOKENS_DAILY_STREAK_SHIELD
    progress.streak_shields += 1
    await db.commit()
    return StreakShieldResponse(
        streak_shields=progress.streak_shields,
        token_balance=progress.token_balance,
    )


@router.post("/gift-tokens", response_model=TokenGiftResponse)
async def gift_tokens(
    body: TokenGiftRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenGiftResponse:
    """Transfer tokens from the caller to a friend. Both the balance
    update and the audit row are written in the same transaction so a
    successful gift always has a paper trail. Rate-limited to one gift
    per recipient per UTC day to stop spam-gifting."""
    if not (MIN_GIFT_TOKENS <= body.amount <= MAX_GIFT_TOKENS):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Gift amount must be between {MIN_GIFT_TOKENS} "
                f"and {MAX_GIFT_TOKENS} tokens."
            ),
        )

    recipient = await db.scalar(
        select(User).where(User.username == body.recipient_username)
    )
    if recipient is None or not recipient.is_active:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot gift tokens to yourself")

    friendship = await db.scalar(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == recipient.id),
                and_(Friendship.user_id == recipient.id, Friendship.friend_id == user_id),
            ),
        )
    )
    if friendship is None:
        raise HTTPException(status_code=403, detail="Recipient must be a friend")

    today_start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
    gifts_today = await db.scalar(
        select(func.count(TokenGift.id)).where(
            TokenGift.sender_id == user_id,
            TokenGift.recipient_id == recipient.id,
            TokenGift.sent_at >= today_start,
        )
    ) or 0
    if gifts_today >= MAX_GIFTS_PER_DAY_PER_RECIPIENT:
        raise HTTPException(
            status_code=429,
            detail="You've already gifted this friend today. Try again tomorrow.",
        )

    sender_progress = await db.get(UserProgress, user_id)
    if sender_progress is None or sender_progress.token_balance < body.amount:
        balance = sender_progress.token_balance if sender_progress else 0
        raise HTTPException(
            status_code=402,
            detail=f"Need {body.amount} tokens (balance {balance}).",
        )

    recipient_progress = await db.get(UserProgress, recipient.id)
    if recipient_progress is None:
        # Recipient registered + accepted a friend request but never
        # submitted an attempt — UserProgress row hasn't been created.
        # Same explicit-init pattern as submit_attempt.
        recipient_progress = UserProgress(
            user_id=recipient.id,
            total_xp=0,
            token_balance=0,
            streak_shields=0,
            longest_streak=0,
            longest_daily_streak=0,
        )
        db.add(recipient_progress)

    sender_progress.token_balance -= body.amount
    recipient_progress.token_balance += body.amount
    db.add(
        TokenGift(
            sender_id=user_id, recipient_id=recipient.id, amount=body.amount
        )
    )
    await db.commit()

    return TokenGiftResponse(
        recipient_username=recipient.username,
        amount=body.amount,
        sender_token_balance=sender_progress.token_balance,
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
    challenge_ids = list({a.challenge_id for a in attempts})
    challenges = await engine.get_challenges(db, challenge_ids) if challenge_ids else {}

    items: list[AttemptHistoryItem] = [
        AttemptHistoryItem(
            attempt_id=attempt.id,
            challenge_id=attempt.challenge_id,
            challenge_title=challenges[attempt.challenge_id].title
            if attempt.challenge_id in challenges
            else None,
            topic=challenges[attempt.challenge_id].topic.value
            if attempt.challenge_id in challenges
            else None,
            difficulty=attempt.difficulty
            or (
                challenges[attempt.challenge_id].difficulty.value
                if attempt.challenge_id in challenges
                else None
            ),
            passed=attempt.passed,
            xp_earned=attempt.xp_earned,
            hints_used=attempt.hints_used,
            time_ms=attempt.time_ms,
            submitted_at=attempt.submitted_at,
        )
        for attempt in attempts
    ]

    return AttemptHistoryResponse(items=items)
