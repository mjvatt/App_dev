import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.dependencies import get_db
from api.models.user import EmailToken, User
from api.schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
)
from services.auth.jwt import create_access_token
from services.email.client import send_password_reset_email, send_verification_email

router = APIRouter()
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)

_VERIFY_TTL = timedelta(hours=24)
_RESET_TTL = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=_pwd.hash(body.password),
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
async def login(
    body: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not _pwd.verify(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(access_token=create_access_token(user.id, settings.secret_key))


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
async def forgot_password(
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
async def reset_password(
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

    user.hashed_password = _pwd.hash(body.new_password)
    record.used_at = _now()
    await db.commit()

    return MessageResponse(message="Password updated successfully")
