from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routers import auth, billing, challenges, leaderboard, progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic handles migrations; nothing to init at runtime
    yield


app = FastAPI(
    title="PowerUpCode API",
    version="0.1.0",
    lifespan=lifespan,
)

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


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
