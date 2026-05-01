"""Pure-logic tests for the friend-rank digest builder."""
from services.digest import FriendActivity, build_friend_digest


def _you(
    username: str = "panda",
    total_xp: int = 100,
    weekly_xp: int = 0,
    weekly_passes: int = 0,
) -> FriendActivity:
    return FriendActivity(
        username=username,
        total_xp=total_xp,
        weekly_xp=weekly_xp,
        weekly_passes=weekly_passes,
    )


def _friend(
    username: str,
    total_xp: int = 0,
    weekly_xp: int = 0,
    weekly_passes: int = 0,
) -> FriendActivity:
    return FriendActivity(
        username=username,
        total_xp=total_xp,
        weekly_xp=weekly_xp,
        weekly_passes=weekly_passes,
    )


def test_no_friends_returns_none() -> None:
    assert build_friend_digest(_you(), friends=[]) is None


def test_no_movement_anywhere_returns_none() -> None:
    you = _you(weekly_xp=0)
    friends = [_friend("alice", weekly_xp=0), _friend("bob", weekly_xp=0)]
    assert build_friend_digest(you, friends) is None


def test_single_mover_produces_digest() -> None:
    you = _you(total_xp=200, weekly_xp=0)
    friends = [_friend("alice", total_xp=150, weekly_xp=80, weekly_passes=2)]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    assert len(digest.top_movers) == 1
    assert digest.top_movers[0].username == "alice"
    assert digest.your_weekly_xp == 0


def test_user_movement_alone_still_produces_digest() -> None:
    """Even if every friend was idle, surfacing the user's own week
    keeps the email useful — they get to see their own progress with
    the rank context."""
    you = _you(total_xp=200, weekly_xp=120, weekly_passes=4)
    friends = [_friend("alice", total_xp=300, weekly_xp=0)]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    assert digest.your_weekly_xp == 120
    assert digest.top_movers == []


def test_top_movers_are_ranked_by_weekly_xp_desc_and_capped_at_three() -> None:
    you = _you(weekly_xp=10)
    friends = [
        _friend("a", weekly_xp=50),
        _friend("b", weekly_xp=300),
        _friend("c", weekly_xp=120),
        _friend("d", weekly_xp=200),
        _friend("e", weekly_xp=0),  # excluded — no weekly movement
    ]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    assert [m.username for m in digest.top_movers] == ["b", "d", "c"]


def test_friend_rank_includes_user_position_by_total_xp() -> None:
    you = _you(username="me", total_xp=200, weekly_xp=10)
    friends = [
        _friend("top1", total_xp=500),
        _friend("top2", total_xp=300),
        _friend("below1", total_xp=100),
        _friend("below2", total_xp=50),
    ]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    # 500 > 300 > 200(me) > 100 > 50  ->  rank 3 of 5
    assert digest.your_friend_rank == 3
    assert digest.total_friends == 4


def test_friend_rank_top_position() -> None:
    you = _you(username="me", total_xp=1000, weekly_xp=10)
    friends = [_friend("a", total_xp=400), _friend("b", total_xp=200)]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    assert digest.your_friend_rank == 1


def test_friend_rank_ties_are_stable_by_username() -> None:
    """Two users with identical XP should rank deterministically. We
    use the alphabetical secondary sort so re-running the cron on the
    same data produces the same email."""
    you = _you(username="zeta", total_xp=200, weekly_xp=10)
    friends = [_friend("alpha", total_xp=200), _friend("beta", total_xp=200)]
    digest = build_friend_digest(you, friends)
    assert digest is not None
    # Tie-breaking by username (asc), so "alpha" beats "beta" beats "zeta".
    assert digest.your_friend_rank == 3
