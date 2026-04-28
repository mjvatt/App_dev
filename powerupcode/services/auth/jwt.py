from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

_ALGORITHM = "HS256"
_EXPIRE_MINUTES = 60 * 24  # 24 hours


def create_access_token(
    user_id: str,
    secret_key: str,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=_EXPIRE_MINUTES))
    encoded: str = jwt.encode({"sub": user_id, "exp": expire}, secret_key, algorithm=_ALGORITHM)
    return encoded


def verify_token(token: str, secret_key: str) -> str | None:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[_ALGORITHM])
        sub: str | None = payload.get("sub")
        return sub
    except JWTError:
        return None
