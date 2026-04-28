"""
Delete all used or expired email_tokens rows.

Opportunistic cleanup runs inside the auth router whenever a new token
is issued for a user, but that only bounds growth per active user. Run
this periodically (e.g., daily cron) to also clear out tokens for
inactive accounts.

Usage (from the powerupcode/ directory):
    python scripts/cleanup_email_tokens.py
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make `api` and `services` importable when running this script directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, or_  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.user import EmailToken  # noqa: E402


async def _run() -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)

    async with Session() as db:
        result = await db.execute(
            delete(EmailToken).where(
                or_(
                    EmailToken.used_at.is_not(None),
                    EmailToken.expires_at < now,
                )
            )
        )
        await db.commit()
        return result.rowcount or 0


def main() -> None:
    deleted = asyncio.run(_run())
    print(f"Deleted {deleted} stale email_tokens row(s).")


if __name__ == "__main__":
    main()
