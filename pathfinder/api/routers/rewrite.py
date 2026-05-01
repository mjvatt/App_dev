from fastapi import APIRouter

from api.schemas import RewriteRequest, RewriteResponse
from services.agents.resume_rewriter import rewrite as rewrite_agent

router = APIRouter()


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite(request: RewriteRequest) -> RewriteResponse:
    return await rewrite_agent(request)
