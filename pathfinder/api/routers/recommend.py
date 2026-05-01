from fastapi import APIRouter

from api.schemas import RecommendRequest, RecommendResponse
from services.agents.synthesizer import synthesize

router = APIRouter()


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest) -> RecommendResponse:
    return await synthesize(request)
