"""Boss Rush — 3 boss-tier challenges, 3 lives, all-or-nothing.

The route writes regular Attempt rows for each submission so the
user's history and curriculum still see boss-rush activity, but with
xp_earned=0 because boss-rush XP is awarded once on terminal state
via UserProgress, not per-attempt.
"""
import random
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_db, require_verified_user
from api.models.challenge import Attempt, BossRushRun, UserProgress
from api.schemas.boss_rush import (
    BossRushAttemptRequest,
    BossRushAttemptResponse,
    BossRushHistoryItem,
    BossRushHistoryResponse,
    BossRushSessionResponse,
)
from api.schemas.challenge import ChallengeResponse
from services.boss_rush import PROBLEM_COUNT, STARTING_LIVES, apply_attempt
from services.engine import get_engine
from services.engine.interface import ChallengeData, Difficulty
from services.engine.repository import ChallengeRepository
from services.tokens import (
    TOKENS_BOSS_RUSH_EXTRA_LIFE,
    TOKENS_BOSS_RUSH_REVIVE,
    grant_for_boss_rush,
)

router = APIRouter()

_HISTORY_LIMIT = 20


def _to_challenge_response(c: ChallengeData) -> ChallengeResponse:
    return ChallengeResponse(
        id=c.id,
        topic=c.topic,
        difficulty=c.difficulty,
        title=c.title,
        prompt=c.prompt,
        constraints=c.constraints,
        examples=c.examples,
    )


async def _build_session_response(
    db: AsyncSession, run: BossRushRun
) -> BossRushSessionResponse:
    current: ChallengeResponse | None = None
    if run.status == "in_progress" and run.current_index < len(run.challenge_ids):
        challenge = await ChallengeRepository().get(
            db, run.challenge_ids[run.current_index]
        )
        if challenge is not None:
            current = _to_challenge_response(challenge)
    return BossRushSessionResponse(
        id=run.id,
        status=run.status,
        current_index=run.current_index,
        lives_remaining=run.lives_remaining,
        attempts_total=run.attempts_total,
        xp_awarded=run.xp_awarded,
        current_challenge=current,
        challenge_ids=list(run.challenge_ids),
        started_at=run.started_at,
        ended_at=run.ended_at,
    )


@router.post("/start", response_model=BossRushSessionResponse)
async def start_boss_rush(
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushSessionResponse:
    """Pick 3 distinct boss-tier challenges and start a run."""
    pool = await ChallengeRepository().list_filtered(db, difficulty=Difficulty.BOSS)
    if len(pool) < PROBLEM_COUNT:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Boss Rush needs at least {PROBLEM_COUNT} boss-tier challenges "
                f"in the bank; found {len(pool)}."
            ),
        )
    picks = random.sample(pool, PROBLEM_COUNT)
    run = BossRushRun(
        user_id=user_id,
        challenge_ids=[c.id for c in picks],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return await _build_session_response(db, run)


@router.get("/{run_id}", response_model=BossRushSessionResponse)
async def get_boss_rush(
    run_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushSessionResponse:
    run = await db.get(BossRushRun, run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return await _build_session_response(db, run)


@router.post("/{run_id}/attempt", response_model=BossRushAttemptResponse)
async def submit_boss_rush_attempt(
    run_id: str,
    body: BossRushAttemptRequest,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushAttemptResponse:
    run = await db.get(BossRushRun, run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "in_progress":
        raise HTTPException(status_code=409, detail=f"Run already {run.status}")

    challenge_id = run.challenge_ids[run.current_index]
    result = await get_engine().evaluate_attempt(
        db, user_id, challenge_id, body.solution, body.time_ms
    )

    # Record the attempt with xp_earned=0; boss-rush XP is awarded once
    # on terminal status via UserProgress below.
    db.add(
        Attempt(
            user_id=user_id,
            challenge_id=challenge_id,
            difficulty=result.difficulty.value if result.difficulty else None,
            passed=result.passed,
            xp_earned=0,
            hints_used=result.hints_used,
            time_ms=result.time_ms,
        )
    )

    outcome = apply_attempt(
        passed=result.passed,
        current_index=run.current_index,
        lives_remaining=run.lives_remaining,
    )
    run.current_index = outcome.new_current_index
    run.lives_remaining = outcome.new_lives_remaining
    run.status = outcome.new_status
    run.attempts_total += 1
    if outcome.new_status != "in_progress":
        run.ended_at = datetime.now(UTC)
        run.xp_awarded = outcome.xp_awarded
        token_grant = grant_for_boss_rush(
            outcome.new_status, outcome.new_lives_remaining
        )
        if outcome.xp_awarded or token_grant:
            await _credit_user_progress(
                db, user_id, outcome.xp_awarded or 0, token_grant
            )

    next_challenge: ChallengeResponse | None = None
    if run.status == "in_progress" and run.current_index < len(run.challenge_ids):
        nxt = await ChallengeRepository().get(
            db, run.challenge_ids[run.current_index]
        )
        if nxt is not None:
            next_challenge = _to_challenge_response(nxt)

    await db.commit()

    return BossRushAttemptResponse(
        passed=result.passed,
        feedback=result.feedback,
        status=run.status,
        current_index=run.current_index,
        lives_remaining=run.lives_remaining,
        attempts_total=run.attempts_total,
        xp_awarded=run.xp_awarded,
        next_challenge=next_challenge,
    )


async def _credit_user_progress(
    db: AsyncSession, user_id: str, xp: int, tokens: int
) -> None:
    """Add boss-rush XP and any token grant to the user's progress.
    Mirrors the tail of submit_attempt without the per-attempt XP /
    streak / topic logic — boss-rush is a separate source."""
    progress = await db.get(UserProgress, user_id)
    if progress is None:
        progress = UserProgress(user_id=user_id, total_xp=xp, token_balance=tokens)
        db.add(progress)
    else:
        progress.total_xp += xp
        progress.token_balance += tokens
    progress.level = progress.total_xp // 100 + 1


@router.post("/{run_id}/revive", response_model=BossRushSessionResponse)
async def revive_boss_rush(
    run_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushSessionResponse:
    """Spend tokens to revive a wiped run. Restores one life and flips
    status back to in_progress. Each revive is independent so a player
    can chain revives at the same cost — the price itself bounds abuse."""
    run = await db.get(BossRushRun, run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "wiped":
        raise HTTPException(
            status_code=409,
            detail=f"Can't revive a run with status {run.status!r}",
        )

    progress = await db.get(UserProgress, user_id)
    if progress is None or progress.token_balance < TOKENS_BOSS_RUSH_REVIVE:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Need {TOKENS_BOSS_RUSH_REVIVE} tokens to revive "
                f"(balance {progress.token_balance if progress else 0})."
            ),
        )

    progress.token_balance -= TOKENS_BOSS_RUSH_REVIVE
    run.status = "in_progress"
    run.lives_remaining = 1
    run.xp_awarded = None
    run.ended_at = None
    await db.commit()
    return await _build_session_response(db, run)


@router.post("/{run_id}/extra-life", response_model=BossRushSessionResponse)
async def buy_extra_life(
    run_id: str,
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushSessionResponse:
    """Spend tokens mid-run to add a life back. Allowed only on still-
    in-progress runs that have already lost at least one life — otherwise
    the spend is wasted on a full pool. Each purchase is independent so a
    player can chain buys at the same cost."""
    run = await db.get(BossRushRun, run_id)
    if run is None or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "in_progress":
        raise HTTPException(
            status_code=409,
            detail=f"Can't buy a life on a run with status {run.status!r}",
        )
    if run.lives_remaining >= STARTING_LIVES:
        raise HTTPException(
            status_code=409,
            detail="Lives are already full — no need to buy one.",
        )

    progress = await db.get(UserProgress, user_id)
    if progress is None or progress.token_balance < TOKENS_BOSS_RUSH_EXTRA_LIFE:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Need {TOKENS_BOSS_RUSH_EXTRA_LIFE} tokens for an extra life "
                f"(balance {progress.token_balance if progress else 0})."
            ),
        )

    progress.token_balance -= TOKENS_BOSS_RUSH_EXTRA_LIFE
    run.lives_remaining += 1
    await db.commit()
    return await _build_session_response(db, run)


@router.get("/me/history", response_model=BossRushHistoryResponse)
async def get_boss_rush_history(
    user_id: Annotated[str, Depends(require_verified_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BossRushHistoryResponse:
    rows = (
        await db.execute(
            select(BossRushRun)
            .where(BossRushRun.user_id == user_id)
            .order_by(BossRushRun.started_at.desc())
            .limit(_HISTORY_LIMIT)
        )
    ).scalars().all()
    return BossRushHistoryResponse(
        items=[
            BossRushHistoryItem(
                id=row.id,
                status=row.status,
                current_index=row.current_index,
                lives_remaining=row.lives_remaining,
                xp_awarded=row.xp_awarded,
                started_at=row.started_at,
                ended_at=row.ended_at,
            )
            for row in rows
        ]
    )
