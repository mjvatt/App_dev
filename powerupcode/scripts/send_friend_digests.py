"""Send the weekly friend-rank-change digest.

Eligibility:
  - Verified, active user.
  - At least one accepted friendship.
  - Active in the last 30 days (totally dormant users get inactivity
    nudges from send_inactivity_emails.py instead — keeps the two cron
    jobs from competing for the same user's inbox).
  - No digest sent in the last 6 days. The cooldown bounds outreach
    even if the cron over-runs.

The digest itself is built by services.digest.build_friend_digest,
which returns None when there's nothing meaningful to say (no
movement). We still bump the cooldown so we don't re-evaluate the
same user every cron tick.

Usage (from powerupcode/):
    python scripts/send_friend_digests.py
    python scripts/send_friend_digests.py --dry-run
    python scripts/send_friend_digests.py --limit 50

Schedule weekly via cron, GitHub Actions, Render scheduled jobs, etc.
"""
import argparse
import asyncio
import sys
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import case, func, or_, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import Attempt, UserProgress  # noqa: E402
from api.models.user import Friendship, User  # noqa: E402
from services.digest import FriendActivity, build_friend_digest  # noqa: E402
from services.email.client import send_friend_digest_email  # noqa: E402

ACTIVITY_WINDOW = timedelta(days=30)
RESEND_COOLDOWN = timedelta(days=6)
WEEKLY_WINDOW = timedelta(days=7)
DEFAULT_LIMIT = 200


def _other_id(row: Friendship, me: str) -> str:
    return row.friend_id if row.user_id == me else row.user_id


async def _run(dry_run: bool, limit: int) -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    activity_cutoff = now - ACTIVITY_WINDOW
    cooldown_cutoff = now - RESEND_COOLDOWN
    weekly_cutoff = now - WEEKLY_WINDOW

    sent = 0
    async with Session() as db:
        eligible_rows = (
            await db.execute(
                select(User.id, User.email, User.username, UserProgress.total_xp)
                .join(UserProgress, UserProgress.user_id == User.id)
                .where(
                    User.is_verified.is_(True),
                    User.is_active.is_(True),
                    UserProgress.last_active.is_not(None),
                    UserProgress.last_active >= activity_cutoff,
                    or_(
                        UserProgress.last_friend_digest_email_at.is_(None),
                        UserProgress.last_friend_digest_email_at < cooldown_cutoff,
                    ),
                )
                .limit(limit)
            )
        ).all()

        for user_id, email, username, your_total_xp in eligible_rows:
            friendships = (
                await db.execute(
                    select(Friendship).where(
                        Friendship.status == "accepted",
                        or_(
                            Friendship.user_id == user_id,
                            Friendship.friend_id == user_id,
                        ),
                    )
                )
            ).scalars().all()
            if not friendships:
                continue

            friend_ids = [_other_id(f, user_id) for f in friendships]

            # Total XP per friend (snapshot for ranking).
            friend_totals = dict(
                (
                    await db.execute(
                        select(UserProgress.user_id, UserProgress.total_xp).where(
                            UserProgress.user_id.in_(friend_ids)
                        )
                    )
                ).all()
            )

            # Username per friend.
            friend_names = dict(
                (
                    await db.execute(
                        select(User.id, User.username).where(User.id.in_(friend_ids))
                    )
                ).all()
            )

            # Weekly XP and pass counts for the user + every friend, in one
            # roundtrip. The CASE expression sums xp_earned only on
            # passing rows; counting passing rows uses the same predicate.
            weekly_rows = (
                await db.execute(
                    select(
                        Attempt.user_id,
                        func.coalesce(
                            func.sum(
                                case((Attempt.passed.is_(True), Attempt.xp_earned), else_=0)
                            ),
                            0,
                        ).label("weekly_xp"),
                        func.coalesce(
                            func.sum(case((Attempt.passed.is_(True), 1), else_=0)),
                            0,
                        ).label("weekly_passes"),
                    )
                    .where(
                        Attempt.user_id.in_([user_id, *friend_ids]),
                        Attempt.submitted_at >= weekly_cutoff,
                    )
                    .group_by(Attempt.user_id)
                )
            ).all()
            weekly_xp: dict[str, int] = defaultdict(int)
            weekly_passes: dict[str, int] = defaultdict(int)
            for row in weekly_rows:
                weekly_xp[row.user_id] = int(row.weekly_xp or 0)
                weekly_passes[row.user_id] = int(row.weekly_passes or 0)

            you = FriendActivity(
                username=username,
                total_xp=your_total_xp,
                weekly_xp=weekly_xp[user_id],
                weekly_passes=weekly_passes[user_id],
            )
            friends = [
                FriendActivity(
                    username=friend_names.get(fid, "(unknown)"),
                    total_xp=friend_totals.get(fid, 0),
                    weekly_xp=weekly_xp[fid],
                    weekly_passes=weekly_passes[fid],
                )
                for fid in friend_ids
            ]

            digest = build_friend_digest(you, friends)
            if digest is None:
                continue

            if dry_run:
                print(
                    f"[dry-run] would email {email}  "
                    f"rank=#{digest.your_friend_rank}/{digest.total_friends + 1}  "
                    f"weekly_xp={digest.your_weekly_xp}  "
                    f"top={[m.username for m in digest.top_movers]}"
                )
                sent += 1
                continue

            try:
                await send_friend_digest_email(
                    email,
                    username,
                    digest.your_weekly_xp,
                    digest.your_weekly_passes,
                    digest.your_friend_rank,
                    digest.total_friends,
                    [(m.username, m.weekly_xp, m.weekly_passes) for m in digest.top_movers],
                )
                progress = await db.get(UserProgress, user_id)
                if progress is not None:
                    progress.last_friend_digest_email_at = now
                sent += 1
            except Exception as exc:  # noqa: BLE001
                print(f"failed to email {email}: {exc}", file=sys.stderr)

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
        help=f"Maximum users to consider in this run (default {DEFAULT_LIMIT}).",
    )
    args = parser.parse_args()
    sent = asyncio.run(_run(dry_run=args.dry_run, limit=args.limit))
    print(f"{'Would have sent' if args.dry_run else 'Sent'} {sent} friend digest(s).")


if __name__ == "__main__":
    main()
