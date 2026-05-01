"""Pure builder for the weekly friend-rank digest.

Takes a snapshot of the current user and their friends (each with total
XP, weekly XP gained, weekly passing attempts) and decides whether the
digest is worth sending. Returns a structured payload the email layer
turns into HTML, or None when there's nothing meaningful to say.

No DB or SMTP coupling; the cron script does that and hands the
results in.
"""
from dataclasses import dataclass

_TOP_MOVERS = 3


@dataclass(frozen=True)
class FriendActivity:
    username: str
    total_xp: int
    weekly_xp: int
    weekly_passes: int


@dataclass(frozen=True)
class FriendDigest:
    your_weekly_xp: int
    your_weekly_passes: int
    your_friend_rank: int  # 1-based by total_xp, includes the user themselves
    total_friends: int
    top_movers: list[FriendActivity]


def build_friend_digest(
    you: FriendActivity, friends: list[FriendActivity]
) -> FriendDigest | None:
    """Decide whether to send and what to include.

    Skip the email when there's nothing to celebrate or compare against:
    no friends, or every party (including the user) made zero progress
    this week. Without weekly movement the digest is just stale rank
    info, which trains users to ignore the email."""
    if not friends:
        return None

    movers = sorted(
        (f for f in friends if f.weekly_xp > 0),
        key=lambda f: f.weekly_xp,
        reverse=True,
    )
    if not movers and you.weekly_xp == 0:
        return None

    # Rank by total_xp including the user. Ties broken by username so
    # the result is stable across runs.
    everyone = sorted(
        [you, *friends],
        key=lambda u: (-u.total_xp, u.username),
    )
    rank = next(i for i, u in enumerate(everyone, 1) if u.username == you.username)

    return FriendDigest(
        your_weekly_xp=you.weekly_xp,
        your_weekly_passes=you.weekly_passes,
        your_friend_rank=rank,
        total_friends=len(friends),
        top_movers=movers[:_TOP_MOVERS],
    )
