"""Mock-interview session lifecycle.

Single-stage runs (legacy + opt-out) keep the original shape: one
challenge, one /end call, one Haiku post-mortem.

Multi-stage runs (Phase 2) sequence three problems — warmup -> main ->
follow-up. Each stage has its own challenge, clock, transcript, and
Haiku grade; the session aggregates scores + bullets at the end and
fires the score-band token grant once on the final advance.

Routes are gated behind require_verified_user since each grading call
hits Haiku. Premium-tier gating lands when subscription enforcement
is wired in.
"""
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_db, require_verified_user
from api.models.challenge import InterviewSession, InterviewStage, UserProgress
from api.rate_limit import limiter
from api.schemas.challenge import ChallengeResponse
from api.schemas.interview import (
    InterviewEndRequest,
    InterviewHistoryItem,
    InterviewHistoryResponse,
    InterviewSessionResponse,
    InterviewStageResponse,
    InterviewStartRequest,
)
from services.engine import get_engine
from services.engine.interface import ChallengeData, Difficulty, Topic
from services.engine.repository import ChallengeRepository
from services.tokens import TOKENS_INTERVIEW_TIME_FREEZE, grant_for_interview_score

router = APIRouter()

_HISTORY_LIMIT = 20
# Joiner used to flatten strengths/improvements into a single TEXT column
# without imposing a JSON migration just for two list fields.
_BULLET_JOIN = "\n"
# Cap per-session time-freezes so a wealthy account can't buy unlimited
# time and erase the soft-target pressure that defines the mode.
_MAX_TIME_FREEZES_PER_SESSION = 3

# Stage labels by index. Frontend uses these for the stage tracker.
_STAGE_LABELS: tuple[str, str, str] = ("warmup", "main", "follow_up")
_NUM_STAGES = len(_STAGE_LABELS)

# Difficulty bumps for the follow-up stage. Boss caps at Boss because
# there's no harder tier; Easy → Medium so the ramp is consistent.
_FOLLOW_UP_BUMP: dict[Difficulty, Difficulty] = {
    Difficulty.EASY: Difficulty.MEDIUM,
    Difficulty.MEDIUM: Difficulty.HARD,
    Difficulty.HARD: Difficulty.BOSS,
    Difficulty.BOSS: Difficulty.BOSS,
}


def _split_bullets(blob: str | None) -> list[str]:
    if not blob:
        return []
    return [line for line in blob.split(_BULLET_JOIN) if line.strip()]


def _join_bullets(items: list[str]) -> str | None:
    return _BULLET_JOIN.join(items) if items else None


def _challenge_response(challenge: ChallengeData) -> ChallengeResponse:
    return ChallengeResponse(
        id=challenge.id,
        topic=challenge.topic,
        difficulty=challenge.difficulty,
        title=challenge.title,
        prompt=challenge.prompt,
        constraints=challenge.constraints,
        examples=challenge.examples,
    )


def _stage_response(
    stage: InterviewStage, challenge: ChallengeData
) -> InterviewStageResponse:
    return InterviewStageResponse(
        stage_index=stage.stage_index,
        label=_STAGE_LABELS[stage.stage_index],
        status=stage.status,
        challenge=_challenge_response(challenge),
        overall_score=stage.overall_score,
        feedback=stage.feedback,
        strengths=_split_bullets(stage.strengths),
        improvements=_split_bullets(stage.improvements),
        time_ms=stage.time_ms,
        time_freezes_used=stage.time_freezes_used,
    )


async def _load_stages(
    db: AsyncSession, session_id: str
) -> list[InterviewStage]:
    rows = (
        await db.execute(
            select(InterviewStage)
            .where(InterviewStage.session_id == session_id)
            .order_by(InterviewStage.stage_index.asc())
        )
    ).scalars().all()
    return list(rows)


async def _to_session_response(
    db: AsyncSession,
    session: InterviewSession,
    *,
    tokens_earned: int = 0,
) -> InterviewSessionResponse:
    """Build the response for either a single- or multi-stage session.
    Multi-stage runs surface the active stage's challenge as the top-
    level `challenge` so existing client code (which only looks at that
    field on /start) keeps working without a special case."""
    repo = ChallengeRepository()
    if session.is_multi_stage:
        stages = await _load_stages(db, session.id)
        challenge_ids = [stage.challenge_id for stage in stages]
        challenges = await repo.get_many(db, challenge_ids)
        # Surface the active stage's challenge at top level. For a completed
        # session, fall back to the main (stage 1) challenge so the report
        # view has something to render.
        active_index = (
            session.current_stage_index
            if session.current_stage_index is not None
            else 1
        )
        active_index = max(0, min(_NUM_STAGES - 1, active_index))
        active_challenge = challenges.get(stages[active_index].challenge_id)
        if active_challenge is None:
            raise HTTPException(
                status_code=404, detail="Stage challenge no longer in bank"
            )
        stage_responses = [
            _stage_response(stage, challenges[stage.challenge_id])
            for stage in stages
            if stage.challenge_id in challenges
        ]
        return InterviewSessionResponse(
            id=session.id,
            status=session.status,
            challenge=_challenge_response(active_challenge),
            topic=session.topic,
            difficulty=session.difficulty,
            started_at=session.started_at,
            ended_at=session.ended_at,
            overall_score=session.overall_score,
            feedback=session.feedback,
            strengths=_split_bullets(session.strengths),
            improvements=_split_bullets(session.improvements),
            time_ms=session.time_ms,
            tokens_earned=tokens_earned,
            time_freezes_used=session.time_freezes_used,
            is_multi_stage=True,
            current_stage_index=session.current_stage_index,
            stages=stage_responses,
        )

    challenge = await repo.get(db, session.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge no longer in bank")
    return InterviewSessionResponse(
        id=session.id,
        status=session.status,
        challenge=_challenge_response(challenge),
        topic=session.topic,
        difficulty=session.difficulty,
        started_at=session.started_at,
        ended_at=session.ended_at,
        overall_score=session.overall_score,
        feedback=session.feedback,
        strengths=_split_bullets(session.strengths),
        improvements=_split_bullets(session.improvements),
        time_ms=session.time_ms,
        tokens_earned=tokens_earned,
        time_freezes_used=session.time_freezes_used,
        is_multi_stage=False,
        current_stage_index=None,
        stages=[],
    )


def _stage_difficulty(stage_index: int, base: Difficulty | None) -> Difficulty | None:
    """Per-stage difficulty selection.

    - warmup: EASY (always)
    - main:   user pick (or None for engine adaptive)
    - follow-up: one tier above main; if user didn't pick, leave None and
      let the engine adapt (we can't bump None deterministically).
    """
    if stage_index == 0:
        return Difficulty.EASY
    if stage_index == 1:
        return base
    # stage_index == 2 — follow-up
    if base is None:
        return None
    return _FOLLOW_UP_BUMP[base]


async def _pick_stage_challenges(
    db: AsyncSession,
    user_id: str,
    topic: Topic | None,
    main_difficulty: Difficulty | None,
) -> list[ChallengeData]:
    """Pick three challenges via the engine, one per stage. Engines that
    can't honor the constraint (small bank, missing tier) simply return
    whatever they have; we don't dedup further because the session is
    keyed by (session_id, stage_index), so a repeated challenge_id is
    legal — it just produces a quieter run."""
    engine = get_engine()
    challenges: list[ChallengeData] = []
    for stage_index in range(_NUM_STAGES):
        difficulty = _stage_difficulty(stage_index, main_difficulty)
        challenge = await engine.next_challenge(db, user_id, topic, difficulty)
        challenges.append(challenge)
    return challenges


def _aggregate_session(stages: list[InterviewStage]) -> tuple[int, str, list[str], list[str], int]:
    """Reduce per-stage grades into the parent session aggregate.

    Returns: (overall_score, feedback, strengths, improvements, total_time_ms)

    Score = unweighted average of stage scores (rounded). Bullets are
    concatenated with stage-name prefix so the user knows which problem
    each insight came from. Time is the sum so the report shows the
    full investment.
    """
    scores = [s.overall_score for s in stages if s.overall_score is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    summaries = [
        f"{_STAGE_LABELS[s.stage_index].replace('_', ' ').title()}: {s.feedback}"
        for s in stages
        if s.feedback
    ]
    feedback = "\n\n".join(summaries) if summaries else ""

    def _prefixed(stage: InterviewStage, items: list[str]) -> list[str]:
        prefix = _STAGE_LABELS[stage.stage_index].replace("_", " ").title()
        return [f"[{prefix}] {item}" for item in items]

    strengths: list[str] = []
    improvements: list[str] = []
    for stage in stages:
        strengths.extend(_prefixed(stage, _split_bullets(stage.strengths)))
        improvements.extend(_prefixed(stage, _split_bullets(stage.improvements)))

    total_time_ms = sum(s.time_ms or 0 for s in stages)
    return overall, feedback, strengths, improvements, total_time_ms


@router.post("/start", response_model=InterviewSessionResponse)
async def start_interview(
    body: InterviewStartRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Create a session and assign challenges. Single-stage runs assign
    one; multi-stage runs assign three (warmup easy / main user-pick /
    follow-up one tier above main) all in the same topic when one is
    specified, else engine-adaptive per stage."""
    topic = Topic(body.topic) if body.topic else None
    difficulty = Difficulty(body.difficulty) if body.difficulty else None

    if body.multi_stage:
        challenges = await _pick_stage_challenges(db, user_id, topic, difficulty)
        # Session.challenge_id is the main (stage 1) challenge so history
        # rows can render a meaningful title without joining the stages
        # table.
        session = InterviewSession(
            user_id=user_id,
            challenge_id=challenges[1].id,
            topic=topic.value if topic else None,
            difficulty=difficulty.value if difficulty else None,
            is_multi_stage=True,
            current_stage_index=0,
        )
        db.add(session)
        await db.flush()  # need session.id before adding stages

        now = datetime.now(UTC)
        for index, challenge in enumerate(challenges):
            db.add(
                InterviewStage(
                    session_id=session.id,
                    stage_index=index,
                    challenge_id=challenge.id,
                    status="in_progress" if index == 0 else "pending",
                    started_at=now if index == 0 else now,
                )
            )
        await db.commit()
        await db.refresh(session)
        return await _to_session_response(db, session)

    challenge = await get_engine().next_challenge(db, user_id, topic, difficulty)
    session = InterviewSession(
        user_id=user_id,
        challenge_id=challenge.id,
        topic=topic.value if topic else None,
        difficulty=difficulty.value if difficulty else None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return await _to_session_response(db, session)


@router.get("/{session_id}", response_model=InterviewSessionResponse)
async def get_interview(
    session_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return await _to_session_response(db, session)


async def _grant_session_score_tokens(
    db: AsyncSession, user_id: str, score: int
) -> int:
    tokens_earned = grant_for_interview_score(score)
    if not tokens_earned:
        return 0
    progress = await db.get(UserProgress, user_id)
    if progress is None:
        progress = UserProgress(
            user_id=user_id,
            token_balance=tokens_earned,
            streak_shields=0,
            longest_streak=0,
            longest_daily_streak=0,
        )
        db.add(progress)
    else:
        progress.token_balance += tokens_earned
    return tokens_earned


@router.post("/{session_id}/advance", response_model=InterviewSessionResponse)
@limiter.limit("12/15minute")
async def advance_stage(
    request: Request,
    session_id: str,
    body: InterviewEndRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Submit the current stage of a multi-stage interview, advance the
    pointer, and (on the final stage) finalize the run with an aggregate
    grade + token grant."""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_multi_stage:
        raise HTTPException(
            status_code=400,
            detail="Single-stage sessions use /end, not /advance",
        )
    if session.status != "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Can't advance a {session.status!r} session",
        )

    stages = await _load_stages(db, session_id)
    current_index = session.current_stage_index
    if current_index is None or not (0 <= current_index < len(stages)):
        raise HTTPException(status_code=409, detail="No active stage to advance")
    current_stage = stages[current_index]

    grade = await get_engine().generate_interview_post_mortem(
        db,
        user_id,
        current_stage.challenge_id,
        body.solution,
        body.transcript,
        body.language,
        body.time_ms,
    )

    now = datetime.now(UTC)
    current_stage.solution = body.solution
    current_stage.transcript = body.transcript
    current_stage.language = body.language
    current_stage.time_ms = body.time_ms
    current_stage.overall_score = grade.overall_score
    current_stage.feedback = grade.feedback
    current_stage.strengths = _join_bullets(grade.strengths)
    current_stage.improvements = _join_bullets(grade.improvements)
    current_stage.status = "completed"
    current_stage.ended_at = now

    next_index = current_index + 1
    tokens_earned = 0
    if next_index < len(stages):
        next_stage = stages[next_index]
        next_stage.status = "in_progress"
        next_stage.started_at = now
        session.current_stage_index = next_index
    else:
        # Final stage — aggregate and lock the run.
        overall, feedback, strengths, improvements, total_time = _aggregate_session(
            stages
        )
        session.status = "completed"
        session.ended_at = now
        session.overall_score = overall
        session.feedback = feedback
        session.strengths = _join_bullets(strengths)
        session.improvements = _join_bullets(improvements)
        session.time_ms = total_time
        tokens_earned = await _grant_session_score_tokens(db, user_id, overall)

    await db.commit()
    await db.refresh(session)
    return await _to_session_response(db, session, tokens_earned=tokens_earned)


@router.post("/{session_id}/end", response_model=InterviewSessionResponse)
@limiter.limit("10/15minute")
async def end_interview(
    request: Request,
    session_id: str,
    body: InterviewEndRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Single-stage runs: record the answer, synthesize the post-mortem,
    lock the session. Idempotent on already-completed runs.

    Multi-stage runs: abandons the run mid-flight without grading. Use
    /advance to actually score a stage."""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.is_multi_stage:
        if session.status != "in_progress":
            return await _to_session_response(db, session)
        session.status = "abandoned"
        session.ended_at = datetime.now(UTC)
        # Abandon the active stage too so the timeline reads cleanly.
        stages = await _load_stages(db, session_id)
        if session.current_stage_index is not None and (
            0 <= session.current_stage_index < len(stages)
        ):
            stages[session.current_stage_index].status = "abandoned"
            stages[session.current_stage_index].ended_at = session.ended_at
        await db.commit()
        await db.refresh(session)
        return await _to_session_response(db, session)

    challenge = await ChallengeRepository().get(db, session.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge no longer in bank")

    if session.status == "completed":
        return await _to_session_response(db, session)

    grade = await get_engine().generate_interview_post_mortem(
        db,
        user_id,
        session.challenge_id,
        body.solution,
        body.transcript,
        body.language,
        body.time_ms,
    )

    session.solution = body.solution
    session.transcript = body.transcript
    session.language = body.language
    session.time_ms = body.time_ms
    session.overall_score = grade.overall_score
    session.feedback = grade.feedback
    session.strengths = _join_bullets(grade.strengths)
    session.improvements = _join_bullets(grade.improvements)
    session.status = "completed"
    session.ended_at = datetime.now(UTC)

    tokens_earned = await _grant_session_score_tokens(db, user_id, grade.overall_score)
    await db.commit()
    await db.refresh(session)
    return await _to_session_response(db, session, tokens_earned=tokens_earned)


@router.post("/{session_id}/time-freeze", response_model=InterviewSessionResponse)
async def buy_time_freeze(
    session_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Spend tokens during an in-progress session to extend the soft
    target by 5 minutes. Cap is per-session even on multi-stage runs so
    the total time pressure remains a real constraint regardless of
    which stage a user spends the freeze on."""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Can't freeze time on a {session.status!r} session",
        )
    if session.time_freezes_used >= _MAX_TIME_FREEZES_PER_SESSION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Already used the maximum {_MAX_TIME_FREEZES_PER_SESSION} "
                f"freezes on this session."
            ),
        )

    progress = await db.get(UserProgress, user_id)
    if progress is None or progress.token_balance < TOKENS_INTERVIEW_TIME_FREEZE:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Need {TOKENS_INTERVIEW_TIME_FREEZE} tokens to freeze time "
                f"(balance {progress.token_balance if progress else 0})."
            ),
        )

    progress.token_balance -= TOKENS_INTERVIEW_TIME_FREEZE
    session.time_freezes_used += 1
    if session.is_multi_stage and session.current_stage_index is not None:
        stages = await _load_stages(db, session_id)
        if 0 <= session.current_stage_index < len(stages):
            stages[session.current_stage_index].time_freezes_used += 1
    await db.commit()
    await db.refresh(session)
    return await _to_session_response(db, session)


@router.get("/me/history", response_model=InterviewHistoryResponse)
async def get_interview_history(
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewHistoryResponse:
    rows = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.started_at.desc())
            .limit(_HISTORY_LIMIT)
        )
    ).scalars().all()

    if not rows:
        return InterviewHistoryResponse(items=[])

    challenge_ids = list({row.challenge_id for row in rows})
    challenges = await ChallengeRepository().get_many(db, challenge_ids)

    items = [
        InterviewHistoryItem(
            id=row.id,
            status=row.status,
            challenge_id=row.challenge_id,
            challenge_title=challenges[row.challenge_id].title
            if row.challenge_id in challenges
            else None,
            topic=row.topic,
            difficulty=row.difficulty,
            overall_score=row.overall_score,
            started_at=row.started_at,
            ended_at=row.ended_at,
        )
        for row in rows
    ]
    return InterviewHistoryResponse(items=items)
