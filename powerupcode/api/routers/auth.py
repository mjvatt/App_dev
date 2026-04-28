import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.dependencies import get_current_user, get_db
from api.models.user import EmailToken, User
from api.rate_limit import limiter
from api.schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserMeResponse,
)
from services.auth.jwt import create_access_token
from services.email.client import send_password_reset_email, send_verification_email

router = APIRouter()
logger = logging.getLogger(__name__)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False

_VERIFY_TTL = timedelta(hours=24)
_RESET_TTL = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/15minute")
async def register(
    request: Request,
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    existing = await db.scalar(
        select(User).where(
            (User.email == body.email) | (User.username == body.username)
        )
    )
    if existing:
        if existing.email == body.email:
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=_hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    verify_token = EmailToken(
        user_id=user.id,
        token_type="verify",
        expires_at=_now() + _VERIFY_TTL,
    )
    db.add(verify_token)
    await db.commit()
    await db.refresh(user)

    try:
        await send_verification_email(user.email, user.username, verify_token.token)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)

    return TokenResponse(access_token=create_access_token(user.id, settings.secret_key))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/15minute")
async def login(
    request: Request,
    body: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(access_token=create_access_token(user.id, settings.secret_key))


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMeResponse:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserMeResponse(
        user_id=user.id,
        username=user.username,
        email=user.email,
        is_verified=user.is_verified,
    )


_RESEND_COOLDOWN = timedelta(minutes=5)


@router.post("/resend-verification", response_model=MessageResponse)
@limiter.limit("3/15minute")
async def resend_verification(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return MessageResponse(message="Email is already verified")

    recent = await db.scalar(
        select(EmailToken).where(
            EmailToken.user_id == user_id,
            EmailToken.token_type == "verify",
            EmailToken.used_at.is_(None),
            EmailToken.created_at >= _now() - _RESEND_COOLDOWN,
        )
    )
    if recent is not None:
        raise HTTPException(
            status_code=429,
            detail="Please wait a few minutes before requesting another verification email",
        )

    token = EmailToken(
        user_id=user_id,
        token_type="verify",
        expires_at=_now() + _VERIFY_TTL,
    )
    db.add(token)
    await db.commit()

    try:
        await send_verification_email(user.email, user.username, token.token)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)

    return MessageResponse(message="Verification email sent")


@router.get("/verify-email", response_model=MessageResponse)
async def verify_email(
    token: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    record = await db.get(EmailToken, token)
    if (
        record is None
        or record.token_type != "verify"
        or record.used_at is not None
        or record.expires_at < _now()
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    user = await db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    user.is_verified = True
    record.used_at = _now()
    await db.commit()

    return MessageResponse(message="Email verified successfully")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/15minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    user = await db.scalar(select(User).where(User.email == body.email))

    if user is not None:
        reset_token = EmailToken(
            user_id=user.id,
            token_type="reset",
            expires_at=_now() + _RESET_TTL,
        )
        db.add(reset_token)
        await db.commit()

        try:
            await send_password_reset_email(user.email, user.username, reset_token.token)
        except Exception:
            logger.exception("Failed to send password reset email to %s", user.email)

    return MessageResponse(message="If that email is registered, a reset link has been sent")


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/15minute")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    record = await db.get(EmailToken, body.token)
    if (
        record is None
        or record.token_type != "reset"
        or record.used_at is not None
        or record.expires_at < _now()
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = await db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.hashed_password = _hash_password(body.new_password)
    record.used_at = _now()
    await db.commit()

    return MessageResponse(message="Password updated successfully")
