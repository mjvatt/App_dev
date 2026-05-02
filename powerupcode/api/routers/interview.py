"""Mock-interview session lifecycle.

Phase 1: single-problem sessions. Start picks one challenge from the
bank scoped to optional topic/difficulty filters; end synthesizes a
post-mortem via Haiku. Phase 2 will add multi-step sequencing.

Routes are gated behind require_verified_user since each end-of-
session triggers a Haiku call. Premium-tier gating lands in Phase 3
when subscription enforcement is wired in.
"""
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_db, require_verified_user
from api.models.challenge import InterviewSession, UserProgress
from api.rate_limit import limiter
from api.schemas.challenge import ChallengeResponse
from api.schemas.interview import (
    InterviewEndRequest,
    InterviewHistoryItem,
    InterviewHistoryResponse,
    InterviewSessionResponse,
    InterviewStartRequest,
)
from services.engine import get_engine
from services.engine.interface import ChallengeData, Difficulty, Topic
from services.engine.repository import ChallengeRepository
from services.tokens import grant_for_interview_score

router = APIRouter()

_HISTORY_LIMIT = 20
# Joiner used to flatten strengths/improvements into a single TEXT column
# without imposing a JSON migration just for two list fields.
_BULLET_JOIN = "\n"


def _split_bullets(blob: str | None) -> list[str]:
    if not blob:
        return []
    return [line for line in blob.split(_BULLET_JOIN) if line.strip()]


def _to_session_response(
    session: InterviewSession,
    challenge: ChallengeData,
    *,
    tokens_earned: int = 0,
) -> InterviewSessionResponse:
    return InterviewSessionResponse(
        id=session.id,
        status=session.status,
        challenge=ChallengeResponse(
            id=challenge.id,
            topic=challenge.topic,
            difficulty=challenge.difficulty,
            title=challenge.title,
            prompt=challenge.prompt,
            constraints=challenge.constraints,
            examples=challenge.examples,
        ),
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
    )


@router.post("/start", response_model=InterviewSessionResponse)
async def start_interview(
    body: InterviewStartRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Create a session and assign a challenge. The same engine path
    that picks the daily challenge picks the interview problem so the
    distribution stays consistent."""
    topic = Topic(body.topic) if body.topic else None
    difficulty = Difficulty(body.difficulty) if body.difficulty else None

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
    return _to_session_response(session, challenge)


@router.get("/{session_id}", response_model=InterviewSessionResponse)
async def get_interview(
    session_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    challenge = await ChallengeRepository().get(db, session.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge no longer in bank")
    return _to_session_response(session, challenge)


@router.post("/{session_id}/end", response_model=InterviewSessionResponse)
@limiter.limit("10/15minute")
async def end_interview(
    request: Request,
    session_id: str,
    body: InterviewEndRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewSessionResponse:
    """Record the user's answer, synthesize the post-mortem, and lock
    the session. Idempotent on already-completed sessions: returns the
    existing report instead of re-running Haiku."""
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    challenge = await ChallengeRepository().get(db, session.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge no longer in bank")

    if session.status == "completed":
        return _to_session_response(session, challenge)

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
    session.strengths = _BULLET_JOIN.join(grade.strengths) if grade.strengths else None
    session.improvements = (
        _BULLET_JOIN.join(grade.improvements) if grade.improvements else None
    )
    session.status = "completed"
    session.ended_at = datetime.now(UTC)

    # Score-band token grant — only on this first-end transition since the
    # idempotent re-fetch path above returns before reaching here.
    tokens_earned = grant_for_interview_score(grade.overall_score)
    if tokens_earned:
        progress = await db.get(UserProgress, user_id)
        if progress is None:
            progress = UserProgress(user_id=user_id, token_balance=tokens_earned)
            db.add(progress)
        else:
            progress.token_balance += tokens_earned

    await db.commit()
    await db.refresh(session)
    return _to_session_response(session, challenge, tokens_earned=tokens_earned)


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
