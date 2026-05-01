"""Integration tests for ChallengeRepository against testcontainers Postgres."""
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from services.engine.interface import ChallengeData, Difficulty, Topic
from services.engine.repository import ChallengeRepository


def _make(
    cid: str,
    *,
    topic: Topic = Topic.ARRAYS,
    difficulty: Difficulty = Difficulty.EASY,
    title: str | None = None,
) -> ChallengeData:
    return ChallengeData(
        id=cid,
        topic=topic,
        difficulty=difficulty,
        title=title or f"Title for {cid}",
        prompt="A representative prompt of sufficient length to be useful.",
        constraints=["1 <= n <= 10"],
        examples=[
            {"input": "n = 1", "output": "1"},
            {"input": "n = 2", "output": "2"},
        ],
    )


@pytest.mark.asyncio
async def test_get_returns_none_for_missing(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    assert await repo.get(db_session, "does-not-exist") is None


@pytest.mark.asyncio
async def test_upsert_then_get_roundtrip(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    original = _make("rt-1", topic=Topic.GRAPHS, difficulty=Difficulty.MEDIUM)
    await repo.upsert(db_session, original)
    await db_session.commit()

    fetched = await repo.get(db_session, "rt-1")
    assert fetched is not None
    assert fetched.id == "rt-1"
    assert fetched.topic == Topic.GRAPHS
    assert fetched.difficulty == Difficulty.MEDIUM
    assert fetched.constraints == ["1 <= n <= 10"]
    assert len(fetched.examples) == 2


@pytest.mark.asyncio
async def test_upsert_updates_in_place(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    await repo.upsert(db_session, _make("up-1", title="First"))
    await db_session.commit()

    await repo.upsert(db_session, _make("up-1", title="Second"))
    await db_session.commit()

    fetched = await repo.get(db_session, "up-1")
    assert fetched is not None
    assert fetched.title == "Second"


@pytest.mark.asyncio
async def test_get_many_returns_only_known_ids(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    await repo.upsert(db_session, _make("a"))
    await repo.upsert(db_session, _make("b"))
    await db_session.commit()

    out = await repo.get_many(db_session, ["a", "b", "missing"])
    assert set(out.keys()) == {"a", "b"}


@pytest.mark.asyncio
async def test_get_many_empty_input_short_circuits(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    assert await repo.get_many(db_session, []) == {}


@pytest.mark.asyncio
async def test_list_filtered_by_topic_and_difficulty(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    await repo.upsert(
        db_session, _make("ar-easy", topic=Topic.ARRAYS, difficulty=Difficulty.EASY)
    )
    await repo.upsert(
        db_session, _make("ar-hard", topic=Topic.ARRAYS, difficulty=Difficulty.HARD)
    )
    await repo.upsert(
        db_session, _make("gr-easy", topic=Topic.GRAPHS, difficulty=Difficulty.EASY)
    )
    await db_session.commit()

    arrays_only = await repo.list_filtered(db_session, topic=Topic.ARRAYS)
    assert {c.id for c in arrays_only} == {"ar-easy", "ar-hard"}

    easy_only = await repo.list_filtered(db_session, difficulty=Difficulty.EASY)
    assert {c.id for c in easy_only} == {"ar-easy", "gr-easy"}

    arrays_easy = await repo.list_filtered(
        db_session, topic=Topic.ARRAYS, difficulty=Difficulty.EASY
    )
    assert [c.id for c in arrays_easy] == ["ar-easy"]


@pytest.mark.asyncio
async def test_pick_daily_is_deterministic_per_date(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    for cid in ("d1", "d2", "d3", "d4", "d5"):
        await repo.upsert(db_session, _make(cid))
    await db_session.commit()

    chosen = await repo.pick_daily(db_session, on_date=date(2026, 5, 1))
    assert chosen is not None
    chosen_again = await repo.pick_daily(db_session, on_date=date(2026, 5, 1))
    assert chosen_again is not None
    assert chosen.id == chosen_again.id


@pytest.mark.asyncio
async def test_pick_daily_returns_none_for_empty_bank(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    assert await repo.pick_daily(db_session, on_date=date(2026, 5, 1)) is None


@pytest.mark.asyncio
async def test_list_all_ids_is_sorted(db_session: AsyncSession) -> None:
    repo = ChallengeRepository()
    for cid in ("zebra", "apple", "mango"):
        await repo.upsert(db_session, _make(cid))
    await db_session.commit()

    assert await repo.list_all_ids(db_session) == ["apple", "mango", "zebra"]
