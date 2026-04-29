from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.config import settings
from api.cookies import ACCESS_COOKIE
from api.models.user import User
from services.auth.jwt import verify_token

_engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
_SessionLocal = async_sessionmaker(_engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with _SessionLocal() as session:
        yield session


def _extract_access_token(request: Request) -> str | None:
    """Look for the access token in (a) the puc_access HttpOnly cookie set
    by the web flow, then (b) Authorization: Bearer for the mobile app
    and any service-to-service callers. Cookie wins if both are present."""
    cookie_token = request.cookies.get(ACCESS_COOKIE)
    if cookie_token:
        return cookie_token
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return None


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> str:
    token = _extract_access_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = verify_token(token, settings.secret_key)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")
    return user_id


async def require_verified_user(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> str:
    """Tighter version of get_current_user that also checks is_verified.
    Use on routes that affect public ranking (XP / attempts / leaderboard
    standings) or that touch real money (billing checkout). Returns 403
    with a stable detail string the frontend can match against."""
    user = await db.get(User, user_id)
    if user is None or not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_verification_required",
        )
    return user_id
