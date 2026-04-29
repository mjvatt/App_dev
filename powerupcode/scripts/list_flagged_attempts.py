"""
Report attempts that were flagged as duplicates of another user's
passing solution.

Internal admin tool — the user is never told their submission was
flagged. Run periodically to review and decide whether to revoke XP,
contact the user, or ignore (some flags are coincidental on trivial
problems where many users converge on the same one-liner).

Usage (from powerupcode/):
    python scripts/list_flagged_attempts.py
    python scripts/list_flagged_attempts.py --since-days 7
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import Attempt  # noqa: E402
from api.models.user import User  # noqa: E402


async def _run(since_days: int) -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    cutoff = datetime.now(UTC) - timedelta(days=since_days)

    async with Session() as db:
        result = await db.execute(
            select(Attempt, User.email, User.username)
            .join(User, User.id == Attempt.user_id)
            .where(
                Attempt.flagged_duplicate.is_(True),
                Attempt.submitted_at >= cutoff,
            )
            .order_by(Attempt.submitted_at.desc())
        )
        rows = result.all()

        if not rows:
            print(f"No flagged attempts in the last {since_days} day(s).")
            return 0

        print(
            f"{'Submitted':<22} {'User':<24} {'Challenge':<24} {'Hash':<16}"
        )
        print("-" * 90)
        for attempt, email, username in rows:
            print(
                f"{attempt.submitted_at.isoformat(timespec='seconds'):<22} "
                f"{(username + ' (' + email + ')')[:23]:<24} "
                f"{attempt.challenge_id[:23]:<24} "
                f"{(attempt.solution_hash or '')[:16]:<16}"
            )
        return len(rows)

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=30)
    args = parser.parse_args()
    count = asyncio.run(_run(since_days=args.since_days))
    print(f"\n{count} flagged attempt(s).")


if __name__ == "__main__":
    main()
