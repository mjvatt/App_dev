"""HttpOnly cookie helpers for access + refresh tokens."""
from typing import Literal, cast

from fastapi import Response

from api.config import settings
from services.auth.sessions import ACCESS_TTL, REFRESH_TTL

ACCESS_COOKIE = "puc_access"
REFRESH_COOKIE = "puc_refresh"

SameSite = Literal["lax", "strict", "none"]


def _samesite() -> SameSite:
    value = settings.cookie_samesite.lower()
    if value not in ("lax", "strict", "none"):
        return "lax"
    return cast(SameSite, value)


def _domain() -> str | None:
    return settings.cookie_domain or None


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set both auth cookies. Both are HttpOnly; the access token is
    short-lived (matches ACCESS_TTL) so an XSS-stolen access token has
    a tight blast radius, and the refresh token lives only as long as
    the server-side session."""
    samesite = _samesite()
    domain = _domain()
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=int(ACCESS_TTL.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=samesite,
        path="/",
        domain=domain,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=int(REFRESH_TTL.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=samesite,
        path="/",
        domain=domain,
    )


def clear_auth_cookies(response: Response) -> None:
    """Used by logout. Sets the cookies to empty values that expire
    immediately so the browser drops them."""
    domain = _domain()
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=domain)
    response.delete_cookie(REFRESH_COOKIE, path="/", domain=domain)
