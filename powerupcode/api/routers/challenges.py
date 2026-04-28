from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.challenge import Attempt, UserProgress
from api.models.user import Subscription
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

_ADAPTIVE_WINDOW = 5
_MEDIUM_PASS_THRESHOLD = 3  # out of _ADAPTIVE_WINDOW
_MIN_ATTEMPTS_FOR_ADAPT = 3
_REVIEW_XP_CAP = 5  # XP for repeat passes of an already-solved challenge


async def _has_previously_passed(
    db: AsyncSession, user_id: str, challenge_id: str
) -> bool:
    result = await db.execute(
        select(Attempt.id)
        .where(
            Attempt.user_id == user_id,
            Attempt.challenge_id == challenge_id,
            Attempt.passed.is_(True),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def _award_xp(raw_xp: int, *, passed: bool, is_repeat_pass: bool) -> int:
    """Pure XP gating logic. Repeat passes of an already-solved challenge
    yield at most _REVIEW_XP_CAP to prevent farming."""
    if not passed:
        return raw_xp
    if is_repeat_pass:
        return min(raw_xp, _REVIEW_XP_CAP)
    return raw_xp


async def _has_active_subscription(db: AsyncSession, user_id: str) -> bool:
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _suggest_difficulty(db: AsyncSession, user_id: str) -> Difficulty:
    result = await db.execute(
        select(Attempt.passed, Attempt.difficulty)
        .where(Attempt.user_id == user_id)
        .order_by(Attempt.submitted_at.desc())
        .limit(_ADAPTIVE_WINDOW)
    )
    recent = result.all()

    if len(recent) < _MIN_ATTEMPTS_FOR_ADAPT:
        return Difficulty.EASY

    passed_count = sum(1 for row in recent if row.passed)
    recent_diffs = {row.difficulty for row in recent}
    at_top_tier = bool(recent_diffs & {Difficulty.HARD.value, Difficulty.BOSS.value})

    if passed_count == len(recent):
        return Difficulty.BOSS if at_top_tier else Difficulty.HARD
    if passed_count >= _MEDIUM_PASS_THRESHOLD:
        return Difficulty.HARD if at_top_tier else Difficulty.MEDIUM
    return Difficulty.EASY


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
    db: Annotated[AsyncSession, Depends(get_db)],
    topic: Topic | None = None,
    difficulty: Difficulty | None = None,
) -> ChallengeResponse:
    if difficulty is None:
        difficulty = await _suggest_difficulty(db, user_id)
    if difficulty != Difficulty.EASY and not await _has_active_subscription(db, user_id):
        raise HTTPException(status_code=402, detail="subscription_required")
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

    is_repeat_pass = result.passed and await _has_previously_passed(db, user_id, challenge_id)
    awarded_xp = _award_xp(result.xp_earned, passed=result.passed, is_repeat_pass=is_repeat_pass)

    attempt = Attempt(
        user_id=user_id,
        challenge_id=challenge_id,
        difficulty=result.difficulty.value if result.difficulty else None,
        passed=result.passed,
        xp_earned=awarded_xp,
        hints_used=result.hints_used,
        time_ms=result.time_ms,
    )
    db.add(attempt)

    progress = await db.get(UserProgress, user_id)
    if progress is None:
        progress = UserProgress(user_id=user_id, total_xp=awarded_xp)
        db.add(progress)
    else:
        progress.total_xp += awarded_xp

    progress.level = _compute_level(progress.total_xp)
    _update_streak(progress)

    if result.passed and result.topic is not None and not is_repeat_pass:
        topics = dict(progress.topics or {})
        key = result.topic.value
        topics[key] = topics.get(key, 0) + 1
        progress.topics = topics

    await db.commit()

    return AttemptResponse(
        attempt_id=attempt.id,
        passed=result.passed,
        xp_earned=awarded_xp,
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
