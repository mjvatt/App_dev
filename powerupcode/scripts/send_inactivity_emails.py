"""
Send re-engagement emails to verified users whose streak just broke.

Eligibility:
  - Verified email (we don't pester unverified accounts).
  - Active account (is_active = true).
  - Had a streak of 1+ before going dark.
  - Last activity was 2-14 days ago. We don't send on day 0 (their
    streak has not yet broken in their timezone) or after 2 weeks
    (the moment is gone; nagging looks desperate).
  - No re-engagement email sent in the last 7 days. The cooldown
    bounds outreach per user even if the cron runs more often.

Usage (from powerupcode/):
    python scripts/send_inactivity_emails.py
    python scripts/send_inactivity_emails.py --dry-run
    python scripts/send_inactivity_emails.py --limit 50

Schedule daily via cron, GitHub Actions, Render scheduled jobs, etc.
The default --limit guards against an accidental run dumping mail to
every dormant account at once.
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import or_, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import UserProgress  # noqa: E402
from api.models.user import User  # noqa: E402
from services.email.client import send_reengagement_email  # noqa: E402

INACTIVITY_MIN = timedelta(days=2)
INACTIVITY_MAX = timedelta(days=14)
RESEND_COOLDOWN = timedelta(days=7)
DEFAULT_LIMIT = 100


async def _run(dry_run: bool, limit: int) -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    cutoff_recent = now - INACTIVITY_MIN  # last_active must be older than this
    cutoff_old = now - INACTIVITY_MAX  # last_active must be newer than this
    cutoff_cooldown = now - RESEND_COOLDOWN

    async with Session() as db:
        result = await db.execute(
            select(User, UserProgress)
            .join(UserProgress, UserProgress.user_id == User.id)
            .where(
                User.is_verified.is_(True),
                User.is_active.is_(True),
                UserProgress.last_active.is_not(None),
                UserProgress.last_active < cutoff_recent,
                UserProgress.last_active >= cutoff_old,
                UserProgress.streak_days >= 1,
                or_(
                    UserProgress.last_reengagement_email_at.is_(None),
                    UserProgress.last_reengagement_email_at < cutoff_cooldown,
                ),
            )
            .limit(limit)
        )
        rows = result.all()

        sent = 0
        for user, progress in rows:
            if dry_run:
                print(
                    f"[dry-run] would email {user.email} "
                    f"(prior streak {progress.streak_days}, "
                    f"last active {progress.last_active})"
                )
                sent += 1
                continue
            try:
                await send_reengagement_email(user.email, user.username, progress.streak_days)
                progress.last_reengagement_email_at = now
                sent += 1
            except Exception as exc:  # noqa: BLE001
                print(f"failed to email {user.email}: {exc}", file=sys.stderr)

        if not dry_run:
            await db.commit()

    await engine.dispose()
    return sent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Skip sends; report eligible users.")
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Maximum users to email in this run (default {DEFAULT_LIMIT}).",
    )
    args = parser.parse_args()
    sent = asyncio.run(_run(dry_run=args.dry_run, limit=args.limit))
    print(f"{'Would have sent' if args.dry_run else 'Sent'} {sent} re-engagement email(s).")


if __name__ == "__main__":
    main()
