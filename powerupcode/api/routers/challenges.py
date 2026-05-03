from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db, require_verified_user
from api.models.challenge import Attempt, DailyChallenge, ReviewSchedule, UserProgress
from api.models.user import Subscription, User
from api.rate_limit import limiter
from api.schemas.challenge import (
    AttemptRequest,
    AttemptResponse,
    ChallengeResponse,
    DailyChallengeResponse,
    DailyLeaderboardEntry,
    DailyLeaderboardResponse,
    DailyStatusResponse,
    ExplanationRequest,
    ExplanationResponse,
    HintRequest,
    HintResponse,
    PersonalBestResponse,
    ReviewRequest,
    ReviewResponse,
)
from services.analytics import Events as AnalyticsEvents
from services.analytics import capture as analytics_capture
from services.engine import get_engine
from services.engine.interface import Difficulty, Topic
from services.engine.similarity import hash_solution
from services.review.scheduler import ReviewState, grade_attempt, schedule_next
from services.tokens import (
    grant_for_activity_streak_milestone,
    grant_for_daily_streak_milestone,
    grant_for_first_pass,
    grant_for_level_up,
)

router = APIRouter()

_ADAPTIVE_WINDOW = 5
_MEDIUM_PASS_THRESHOLD = 3  # out of _ADAPTIVE_WINDOW
_MIN_ATTEMPTS_FOR_ADAPT = 3
_REVIEW_XP_CAP = 5  # XP for repeat passes of an already-solved challenge
_STREAK_MILESTONES = (3, 7, 14, 30, 60, 100, 365)
_DAILY_STREAK_MILESTONES = (3, 7, 14, 30, 100, 365)


def _milestone_just_hit(prior: int, current: int) -> int | None:
    """Return the streak milestone the user just crossed, or None."""
    for m in _STREAK_MILESTONES:
        if prior < m <= current:
            return m
    return None


def _daily_milestone_just_hit(prior: int, current: int) -> int | None:
    for m in _DAILY_STREAK_MILESTONES:
        if prior < m <= current:
            return m
    return None


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


async def _update_review_schedule(
    db: AsyncSession,
    user_id: str,
    challenge_id: str,
    passed: bool,
    hints_used: int,
) -> None:
    """Insert or update the user's review schedule for this challenge
    using SM-2. Failed attempts reset the cadence; passing keeps it
    growing."""
    quality = grade_attempt(passed=passed, hints_used=hints_used)
    now = datetime.now(UTC)

    row = await db.scalar(
        select(ReviewSchedule).where(
            ReviewSchedule.user_id == user_id,
            ReviewSchedule.challenge_id == challenge_id,
        )
    )
    if row is None:
        prior = ReviewState(ease_factor=2.5, interval_days=0, repetitions=0)
        next_state = schedule_next(prior, quality)
        db.add(
            ReviewSchedule(
                user_id=user_id,
                challenge_id=challenge_id,
                ease_factor=next_state.ease_factor,
                interval_days=next_state.interval_days,
                repetitions=next_state.repetitions,
                due_at=now + timedelta(days=next_state.interval_days),
                last_quality=quality,
                last_reviewed_at=now,
            )
        )
        return

    prior = ReviewState(
        ease_factor=row.ease_factor,
        interval_days=row.interval_days,
        repetitions=row.repetitions,
    )
    next_state = schedule_next(prior, quality)
    row.ease_factor = next_state.ease_factor
    row.interval_days = next_state.interval_days
    row.repetitions = next_state.repetitions
    row.due_at = now + timedelta(days=next_state.interval_days)
    row.last_quality = quality
    row.last_reviewed_at = now


async def _is_duplicate_of_another_user(
    db: AsyncSession, user_id: str, challenge_id: str, solution_hash: str
) -> bool:
    """True if any other user has already submitted a passing attempt
    with this exact normalized hash on this challenge. Internal flag —
    we never block the submission."""
    result = await db.execute(
        select(Attempt.id)
        .where(
            Attempt.challenge_id == challenge_id,
            Attempt.solution_hash == solution_hash,
            Attempt.passed.is_(True),
            Attempt.user_id != user_id,
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


def _update_daily_streak(progress: UserProgress, today_utc: date) -> int:
    """Tick the user's daily-challenge streak when they pass the daily for
    a UTC calendar day they haven't already solved. Same calendar-math
    shape as _update_streak but driven off `last_daily_solved_date` so the
    activity streak and the daily streak don't interfere.

    Returns the number of streak shields auto-consumed to bridge a gap.
    A gap of N days needs (N - 1) shields to preserve the streak; if the
    user has fewer, the streak resets and zero shields are spent (the
    spend would have been wasted on a partial bridge)."""
    last = progress.last_daily_solved_date
    if last is None:
        progress.daily_streak_days = 1
        progress.last_daily_solved_date = today_utc
        _ratchet_longest_daily_streak(progress)
        return 0

    delta = (today_utc - last).days
    if delta == 0:
        return 0  # already solved today's daily; idempotent
    if delta == 1:
        progress.daily_streak_days += 1
        progress.last_daily_solved_date = today_utc
        _ratchet_longest_daily_streak(progress)
        return 0

    # delta > 1 → user missed (delta - 1) days. Spend shields if enough.
    # `or 0` guards against an in-memory progress instance constructed
    # without the column populated (the DB default only fires on flush).
    missed_days = delta - 1
    shields_held = progress.streak_shields or 0
    if shields_held >= missed_days:
        progress.streak_shields = shields_held - missed_days
        progress.daily_streak_days += 1
        progress.last_daily_solved_date = today_utc
        _ratchet_longest_daily_streak(progress)
        return missed_days

    progress.daily_streak_days = 1
    progress.last_daily_solved_date = today_utc
    _ratchet_longest_daily_streak(progress)
    return 0


def _ratchet_longest_daily_streak(progress: UserProgress) -> None:
    progress.longest_daily_streak = max(
        progress.longest_daily_streak or 0, progress.daily_streak_days
    )


def _ratchet_longest_streak(progress: UserProgress) -> None:
    progress.longest_streak = max(progress.longest_streak or 0, progress.streak_days)


async def _get_today_daily_id(db: AsyncSession) -> str | None:
    """Read-only lookup for today's daily challenge id. Unlike
    _resolve_daily_challenge_id, this does NOT create a daily_challenges row
    if missing — the calling path is submit_attempt, which mustn't have
    side effects on a non-daily submission."""
    today = datetime.now(UTC).date()
    row = await db.scalar(
        select(DailyChallenge.challenge_id).where(DailyChallenge.date == today)
    )
    return row if isinstance(row, str) else None


def _update_streak(progress: UserProgress, now: datetime | None = None) -> None:
    """Streak is measured in UTC days. A user keeps their streak by submitting
    at least one attempt within consecutive UTC calendar days. Server local time
    is intentionally ignored so users in different timezones see the same
    rollover boundary."""
    current = now or datetime.now(UTC)
    today_utc = current.date()
    if progress.last_active is None:
        progress.streak_days = 1
    else:
        last_active_utc = progress.last_active.astimezone(UTC).date()
        delta = (today_utc - last_active_utc).days
        if delta == 1:
            progress.streak_days += 1
        elif delta > 1:
            progress.streak_days = 1
        # delta == 0 (same UTC day): no change
    progress.last_active = current
    _ratchet_longest_streak(progress)


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
    challenge = await get_engine().next_challenge(db, user_id, topic, difficulty)
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
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttemptResponse:
    result = await get_engine().evaluate_attempt(
        db, user_id, challenge_id, body.solution, body.time_ms
    )

    is_repeat_pass = result.passed and await _has_previously_passed(db, user_id, challenge_id)
    awarded_xp = _award_xp(result.xp_earned, passed=result.passed, is_repeat_pass=is_repeat_pass)

    sol_hash = hash_solution(body.solution)
    flagged = (
        result.passed
        and bool(sol_hash)
        and await _is_duplicate_of_another_user(db, user_id, challenge_id, sol_hash)
    )

    attempt = Attempt(
        user_id=user_id,
        challenge_id=challenge_id,
        difficulty=result.difficulty.value if result.difficulty else None,
        passed=result.passed,
        xp_earned=awarded_xp,
        hints_used=result.hints_used,
        time_ms=result.time_ms,
        solution_hash=sol_hash or None,
        flagged_duplicate=flagged,
    )
    db.add(attempt)

    progress = await db.get(UserProgress, user_id)
    if progress is None:
        prior_level = 1
        prior_streak = 0
        prior_daily_streak = 0
        # token_balance, streak_shields, and longest_* must be initialized
        # explicitly — column server_defaults only fire on flush, so the
        # in-memory attributes start as None and break += / max() below.
        progress = UserProgress(
            user_id=user_id,
            total_xp=awarded_xp,
            token_balance=0,
            streak_shields=0,
            longest_streak=0,
            longest_daily_streak=0,
        )
        db.add(progress)
    else:
        prior_level = progress.level
        prior_streak = progress.streak_days
        prior_daily_streak = progress.daily_streak_days
        progress.total_xp += awarded_xp

    progress.level = _compute_level(progress.total_xp)
    level_tokens = grant_for_level_up(prior_level, progress.level)
    _update_streak(progress)

    if result.passed and result.topic is not None and not is_repeat_pass:
        topics = dict(progress.topics or {})
        key = result.topic.value
        topics[key] = topics.get(key, 0) + 1
        progress.topics = topics

    daily_milestone: int | None = None
    streak_shields_consumed = 0
    if result.passed:
        today_daily_id = await _get_today_daily_id(db)
        if today_daily_id == challenge_id:
            today_utc = datetime.now(UTC).date()
            streak_shields_consumed = _update_daily_streak(progress, today_utc)
            daily_milestone = _daily_milestone_just_hit(
                prior_daily_streak, progress.daily_streak_days
            )

    activity_milestone = _milestone_just_hit(prior_streak, progress.streak_days)
    streak_tokens = grant_for_activity_streak_milestone(activity_milestone)
    daily_streak_tokens = grant_for_daily_streak_milestone(daily_milestone)
    first_pass_tokens = grant_for_first_pass(
        result.difficulty, passed=result.passed, is_repeat_pass=is_repeat_pass
    )
    tokens_earned = (
        level_tokens + streak_tokens + daily_streak_tokens + first_pass_tokens
    )
    progress.token_balance += tokens_earned

    await _update_review_schedule(
        db, user_id, challenge_id, passed=result.passed, hints_used=result.hints_used
    )

    await db.commit()

    if result.passed and not is_repeat_pass:
        analytics_capture(
            user_id,
            AnalyticsEvents.AttemptFirstPass,
            {
                "challenge_id": challenge_id,
                "topic": result.topic.value if result.topic else None,
                "difficulty": result.difficulty.value if result.difficulty else None,
                "hints_used": result.hints_used,
                "time_ms": result.time_ms,
            },
        )

    return AttemptResponse(
        attempt_id=attempt.id,
        passed=result.passed,
        xp_earned=awarded_xp,
        feedback=result.feedback,
        hints_used=result.hints_used,
        time_ms=result.time_ms,
        leveled_up=progress.level > prior_level,
        new_level=progress.level,
        streak_days=progress.streak_days,
        streak_milestone=activity_milestone,
        daily_streak_days=progress.daily_streak_days,
        daily_streak_milestone=daily_milestone,
        tokens_earned=tokens_earned,
        streak_shields_consumed=streak_shields_consumed,
    )


async def _resolve_daily_challenge_id(db: AsyncSession) -> str:
    """Look up today's daily assignment, creating it on first call of the day.
    Persisting the assignment means historical leaderboards stay stable even
    if the underlying challenge bank is reseeded later."""
    today = datetime.now(UTC).date()
    row = await db.scalar(select(DailyChallenge).where(DailyChallenge.date == today))
    if row is not None:
        return row.challenge_id
    challenge = await get_engine().get_daily_challenge(db, today)
    db.add(DailyChallenge(date=today, challenge_id=challenge.id))
    await db.commit()
    return challenge.id


async def _daily_status(
    db: AsyncSession, user_id: str, daily_challenge_id: str
) -> DailyStatusResponse:
    today = datetime.now(UTC).date()
    today_start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    today_end = today_start + timedelta(days=1)

    user_attempt = await db.scalar(
        select(Attempt)
        .where(
            Attempt.user_id == user_id,
            Attempt.challenge_id == daily_challenge_id,
            Attempt.passed.is_(True),
            Attempt.submitted_at >= today_start,
            Attempt.submitted_at < today_end,
        )
        .order_by(Attempt.time_ms.asc())
        .limit(1)
    )
    if user_attempt is None:
        return DailyStatusResponse(solved=False, time_ms=None, rank=None)

    faster_count = await db.scalar(
        select(func.count(func.distinct(Attempt.user_id)))
        .where(
            Attempt.challenge_id == daily_challenge_id,
            Attempt.passed.is_(True),
            Attempt.submitted_at >= today_start,
            Attempt.submitted_at < today_end,
            Attempt.time_ms < user_attempt.time_ms,
        )
    )
    rank = (faster_count or 0) + 1
    return DailyStatusResponse(solved=True, time_ms=user_attempt.time_ms, rank=rank)


@router.get("/daily", response_model=DailyChallengeResponse)
async def get_daily_challenge_route(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DailyChallengeResponse:
    """Today's challenge — same problem for every user, ranked by completion time."""
    daily_id = await _resolve_daily_challenge_id(db)
    challenge = await get_engine().get_challenge(db, daily_id)
    if challenge is None:
        raise HTTPException(status_code=500, detail="Daily challenge unavailable")
    status = await _daily_status(db, user_id, daily_id)
    return DailyChallengeResponse(
        challenge=ChallengeResponse(
            id=challenge.id,
            topic=challenge.topic,
            difficulty=challenge.difficulty,
            title=challenge.title,
            prompt=challenge.prompt,
            constraints=challenge.constraints,
            examples=challenge.examples,
        ),
        status=status,
    )


@router.get("/daily/leaderboard", response_model=DailyLeaderboardResponse)
async def get_daily_leaderboard(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DailyLeaderboardResponse:
    """Top 10 fastest solvers of today's daily challenge."""
    daily_id = await _resolve_daily_challenge_id(db)
    today = datetime.now(UTC).date()
    today_start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    today_end = today_start + timedelta(days=1)

    # First passing attempt per user, ordered by time_ms.
    fastest_per_user = (
        select(
            Attempt.user_id.label("user_id"),
            func.min(Attempt.time_ms).label("time_ms"),
        )
        .where(
            Attempt.challenge_id == daily_id,
            Attempt.passed.is_(True),
            Attempt.submitted_at >= today_start,
            Attempt.submitted_at < today_end,
        )
        .group_by(Attempt.user_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(User.username, fastest_per_user.c.user_id, fastest_per_user.c.time_ms)
            .join(User, User.id == fastest_per_user.c.user_id)
            .order_by(fastest_per_user.c.time_ms.asc())
            .limit(10)
        )
    ).all()

    total = await db.scalar(
        select(func.count()).select_from(fastest_per_user)
    ) or 0

    entries = [
        DailyLeaderboardEntry(
            rank=i + 1,
            username=row.username,
            time_ms=row.time_ms,
            is_current_user=row.user_id == user_id,
        )
        for i, row in enumerate(rows)
    ]
    return DailyLeaderboardResponse(entries=entries, total_solvers=int(total))


@router.get("/review", response_model=ChallengeResponse)
async def get_next_review(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChallengeResponse:
    """Return the most overdue challenge from the user's review schedule.
    404 if nothing is due yet — caller should fall back to /next."""
    now = datetime.now(UTC)
    row = await db.scalar(
        select(ReviewSchedule)
        .where(ReviewSchedule.user_id == user_id, ReviewSchedule.due_at <= now)
        .order_by(ReviewSchedule.due_at.asc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="No reviews due")

    challenge = await get_engine().get_challenge(db, row.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return ChallengeResponse(
        id=challenge.id,
        topic=challenge.topic,
        difficulty=challenge.difficulty,
        title=challenge.title,
        prompt=challenge.prompt,
        constraints=challenge.constraints,
        examples=challenge.examples,
    )


@router.post("/{challenge_id}/review", response_model=ReviewResponse)
@limiter.limit("20/15minute")
async def request_review(
    request: Request,
    challenge_id: str,
    body: ReviewRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    """Post-pass code review. Rate limited because each call is a Haiku
    request and a malicious user spam-clicking would burn API budget."""
    review = await get_engine().generate_review(
        db, user_id, challenge_id, body.solution, body.language
    )
    return ReviewResponse(review=review.review, available=review.available)


@router.post("/{challenge_id}/hint", response_model=HintResponse)
async def request_hint(
    challenge_id: str,
    body: HintRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HintResponse:
    hint = await get_engine().generate_hint(
        db, user_id, challenge_id, body.current_attempt
    )
    return HintResponse(hint=hint.hint, hints_remaining=hint.hints_remaining)


@router.get("/{challenge_id}/personal-best", response_model=PersonalBestResponse)
async def get_personal_best(
    challenge_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PersonalBestResponse:
    """Fastest passing attempt + total pass count for this user on this
    challenge. Drives the Quick Play timer's PB chase indicator."""
    result = await db.execute(
        select(
            func.min(Attempt.time_ms).label("best"),
            func.count().label("passes"),
        )
        .where(
            Attempt.user_id == user_id,
            Attempt.challenge_id == challenge_id,
            Attempt.passed.is_(True),
            # Exclude time_ms == 0 since older clients submitted without
            # timing data and 0 would always win the MIN comparison.
            Attempt.time_ms > 0,
        )
    )
    row = result.one()
    return PersonalBestResponse(
        best_time_ms=row.best,
        pass_count=int(row.passes or 0),
    )


@router.post("/{challenge_id}/explanation", response_model=ExplanationResponse)
@limiter.limit("20/15minute")
async def request_explanation_grade(
    request: Request,
    challenge_id: str,
    body: ExplanationRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExplanationResponse:
    """Grade a verbal-explanation transcript across four interview-style
    dimensions. Same rate-limit cohort as code review since each call is
    a Haiku request."""
    grade = await get_engine().grade_explanation(
        db, user_id, challenge_id, body.solution, body.transcript
    )
    return ExplanationResponse(
        correctness=grade.correctness,
        clarity=grade.clarity,
        completeness=grade.completeness,
        communication=grade.communication,
        overall=grade.overall,
        feedback=grade.feedback,
        available=grade.available,
    )
