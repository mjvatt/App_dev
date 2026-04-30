from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import Response

from api.config import settings
from api.rate_limit import limiter
from api.routers import (
    auth,
    billing,
    challenges,
    curriculum,
    friends,
    leaderboard,
    progress,
)

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Don't send PII unless we explicitly opt in per-event.
        send_default_pii=False,
    )


async def _rate_limit_handler(request: Request, exc: Exception) -> Response:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down and try again shortly."},
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Alembic handles migrations; nothing to init at runtime
    yield


app = FastAPI(
    title="PowerUpCode API",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(challenges.router, prefix="/api/challenges", tags=["challenges"])
app.include_router(progress.router, prefix="/api/progress", tags=["progress"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["leaderboard"])
app.include_router(curriculum.router, prefix="/api/curriculum", tags=["curriculum"])
app.include_router(friends.router, prefix="/api/friends", tags=["friends"])


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
