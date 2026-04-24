from typing import Annotated

from fastapi import APIRouter, Depends

from api.dependencies import get_current_user
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


@router.get("/next", response_model=ChallengeResponse)
async def get_next_challenge(
    user_id: Annotated[str, Depends(get_current_user)],
    topic: Topic | None = None,
    difficulty: Difficulty | None = None,
) -> ChallengeResponse:
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
) -> AttemptResponse:
    result = await get_engine().evaluate_attempt(user_id, challenge_id, body.solution, body.time_ms)
    return AttemptResponse(
        attempt_id=result.attempt_id,
        passed=result.passed,
        xp_earned=result.xp_earned,
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
