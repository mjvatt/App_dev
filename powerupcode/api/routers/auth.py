import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
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
    VerifyEmailRequest,
    VerifyEmailStatusResponse,
)
from services.auth.sessions import (
    create_session,
    revoke_all_for_user,
    revoke_session_by_refresh,
    rotate_session,
)
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
    return datetime.now(UTC)


async def _purge_stale_tokens(db: AsyncSession, user_id: str, token_type: str) -> None:
    """Drop any used or expired tokens of the given type for this user.
    Called opportunistically when we issue a fresh token, so the
    email_tokens table stays bounded without a separate cron job."""
    await db.execute(
        delete(EmailToken).where(
            EmailToken.user_id == user_id,
            EmailToken.token_type == token_type,
            or_(
                EmailToken.used_at.is_not(None),
                EmailToken.expires_at < _now(),
            ),
        )
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/15minute")
async def register(
    request: Request,
    response: Response,
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

    access_token, refresh_token, _ = await create_session(
        db, user.id, settings.secret_key, user_agent=request.headers.get("user-agent")
    )
    await db.commit()
    await db.refresh(user)

    try:
        await send_verification_email(user.email, user.username, verify_token.token)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)

    set_auth_cookies(response, access_token, refresh_token)
    # The body still carries the access token so the mobile client (which
    # cannot store HttpOnly cookies) keeps working.
    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/15minute")
async def login(
    request: Request,
    response: Response,
    body: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token, refresh_token, _ = await create_session(
        db, user.id, settings.secret_key, user_agent=request.headers.get("user-agent")
    )
    await db.commit()

    set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/15minute")
async def refresh(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Exchange a valid refresh token for a new access + refresh pair.
    Reads the refresh token from the puc_refresh cookie (web) or from a
    JSON body field 'refresh_token' (mobile)."""
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        try:
            payload = await request.json()
        except Exception:
            payload = None
        if isinstance(payload, dict):
            refresh_token = payload.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    rotated = await rotate_session(
        db, refresh_token, settings.secret_key, user_agent=request.headers.get("user-agent")
    )
    if rotated is None:
        await db.rollback()
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    new_access, new_refresh, _ = rotated
    await db.commit()

    set_auth_cookies(response, new_access, new_refresh)
    return TokenResponse(access_token=new_access)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Revoke the current session server-side and clear the cookies.
    Idempotent: returns 200 even if no session exists."""
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        try:
            payload = await request.json()
        except Exception:
            payload = None
        if isinstance(payload, dict):
            refresh_token = payload.get("refresh_token")

    if refresh_token:
        await revoke_session_by_refresh(db, refresh_token)
        await db.commit()

    clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


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

    await _purge_stale_tokens(db, user_id, "verify")
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


@router.get("/verify-email", response_model=VerifyEmailStatusResponse)
async def verify_email_status(
    token: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VerifyEmailStatusResponse:
    """Read-only token check. Email scanners and link prefetchers can hit
    this freely — it never mutates the token. The actual verification is
    performed via POST /verify-email, which the frontend triggers from a
    user-clicked button."""
    record = await db.get(EmailToken, token)
    if record is None or record.token_type != "verify":
        return VerifyEmailStatusResponse(status="invalid")
    if record.used_at is not None:
        return VerifyEmailStatusResponse(status="used")
    if record.expires_at < _now():
        return VerifyEmailStatusResponse(status="expired")
    return VerifyEmailStatusResponse(status="pending")


@router.post("/verify-email", response_model=MessageResponse)
@limiter.limit("10/15minute")
async def verify_email(
    request: Request,
    body: VerifyEmailRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    record = await db.get(EmailToken, body.token)
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
        await _purge_stale_tokens(db, user.id, "reset")
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
    await revoke_all_for_user(db, user.id)
    await db.commit()

    return MessageResponse(message="Password updated successfully")
