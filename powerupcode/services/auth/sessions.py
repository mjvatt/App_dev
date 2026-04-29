"""
Refresh-token-backed session management.

Two tokens per login:
  - Access token: short-lived JWT (15 min). Carries the user_id claim.
    Sent on every request via the puc_access cookie or Authorization header.
  - Refresh token: long-lived opaque random string (30 days). Stored
    server-side as a SHA-256 hash and exchanged for a new access+refresh
    pair via /api/auth/refresh. Each refresh rotates the token (the old
    one is revoked) so a stolen refresh token only works once.

A session row in the DB binds a hashed refresh token to a user. Logout
revokes the session, so even an unexpired refresh cannot be used after
a logout.
"""
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession as DBSession

from api.models.user import Session as SessionRow
from services.auth.jwt import create_access_token

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


async def create_session(
    db: DBSession,
    user_id: str,
    secret_key: str,
    user_agent: str | None = None,
) -> tuple[str, str, SessionRow]:
    """Mint a fresh access token + refresh token and persist the session.
    Returns (access_token, refresh_token_plaintext, session_row).
    """
    refresh_token = secrets.token_urlsafe(48)
    session = SessionRow(
        user_id=user_id,
        refresh_token_hash=_hash_refresh(refresh_token),
        expires_at=_now() + REFRESH_TTL,
        last_used_at=_now(),
        user_agent=user_agent,
    )
    db.add(session)
    await db.flush()

    access_token = create_access_token(user_id, secret_key, expires_delta=ACCESS_TTL)
    return access_token, refresh_token, session


async def rotate_session(
    db: DBSession,
    refresh_token: str,
    secret_key: str,
    user_agent: str | None = None,
) -> tuple[str, str, SessionRow] | None:
    """Validate the presented refresh token, revoke the old session row,
    and issue a fresh access + refresh pair backed by a new session row.
    Returns None if the refresh token is invalid, expired, or revoked."""
    hashed = _hash_refresh(refresh_token)
    row = await db.scalar(select(SessionRow).where(SessionRow.refresh_token_hash == hashed))
    if row is None:
        return None
    if row.revoked_at is not None or row.expires_at < _now():
        return None

    # Mark the presented refresh token as revoked. Concurrent refresh
    # attempts that race past this point will hit the same row and get
    # one valid result; the loser sees revoked_at and returns None.
    row.revoked_at = _now()
    await db.flush()

    return await create_session(db, row.user_id, secret_key, user_agent=user_agent)


async def revoke_session_by_refresh(db: DBSession, refresh_token: str) -> None:
    """Revoke the session that matches this refresh token (used by logout).
    Silent no-op if the token doesn't match — logout should not leak
    whether a token was valid."""
    hashed = _hash_refresh(refresh_token)
    await db.execute(
        update(SessionRow)
        .where(SessionRow.refresh_token_hash == hashed, SessionRow.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


async def revoke_all_for_user(db: DBSession, user_id: str) -> None:
    """Revoke every active session belonging to a user. Useful for
    'sign out everywhere' and password-reset flows."""
    await db.execute(
        update(SessionRow)
        .where(SessionRow.user_id == user_id, SessionRow.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
