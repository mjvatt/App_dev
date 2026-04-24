from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

_ALGORITHM = "HS256"
_EXPIRE_MINUTES = 60 * 24  # 24 hours


def create_access_token(
    user_id: str,
    secret_key: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=_EXPIRE_MINUTES))
    return jwt.encode({"sub": user_id, "exp": expire}, secret_key, algorithm=_ALGORITHM)


def verify_token(token: str, secret_key: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[_ALGORITHM])
        sub: Optional[str] = payload.get("sub")
        return sub
    except JWTError:
        return None
