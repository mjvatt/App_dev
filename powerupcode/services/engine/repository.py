"""Data access for the canonical challenge bank.

Converts between the DB-backed `Challenge` SQLAlchemy model and the
engine-facing `ChallengeData` dataclass. Engines read challenges
through this repository rather than holding an in-memory dict.
"""
import datetime
import hashlib
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.challenge import Challenge
from services.engine.interface import ChallengeData, Difficulty, Topic


def _row_to_data(row: Challenge) -> ChallengeData:
    return ChallengeData(
        id=row.id,
        topic=Topic(row.topic),
        difficulty=Difficulty(row.difficulty),
        title=row.title,
        prompt=row.prompt,
        constraints=list(row.constraints or []),
        examples=list(row.examples or []),
    )


class ChallengeRepository:
    async def get(self, db: AsyncSession, challenge_id: str) -> ChallengeData | None:
        row = await db.get(Challenge, challenge_id)
        return _row_to_data(row) if row is not None else None

    async def get_many(
        self, db: AsyncSession, challenge_ids: Iterable[str]
    ) -> dict[str, ChallengeData]:
        ids = list(challenge_ids)
        if not ids:
            return {}
        result = await db.execute(select(Challenge).where(Challenge.id.in_(ids)))
        return {row.id: _row_to_data(row) for row in result.scalars().all()}

    async def list_filtered(
        self,
        db: AsyncSession,
        topic: Topic | None = None,
        difficulty: Difficulty | None = None,
    ) -> list[ChallengeData]:
        stmt = select(Challenge)
        if topic is not None:
            stmt = stmt.where(Challenge.topic == topic.value)
        if difficulty is not None:
            stmt = stmt.where(Challenge.difficulty == difficulty.value)
        result = await db.execute(stmt)
        return [_row_to_data(row) for row in result.scalars().all()]

    async def list_all_ids(self, db: AsyncSession) -> list[str]:
        result = await db.execute(select(Challenge.id).order_by(Challenge.id))
        return list(result.scalars().all())

    async def pick_daily(
        self, db: AsyncSession, on_date: datetime.date | None = None
    ) -> ChallengeData | None:
        """Deterministic daily-challenge selection: SHA-256(date) mod bank
        size. Returns None if the bank is empty so the caller can decide
        how to surface an empty-bank state."""
        target = on_date or datetime.datetime.now(datetime.UTC).date()
        ids = await self.list_all_ids(db)
        if not ids:
            return None
        h = hashlib.sha256(target.isoformat().encode("utf-8")).digest()
        idx = int.from_bytes(h[:8], "big") % len(ids)
        return await self.get(db, ids[idx])

    async def upsert(
        self,
        db: AsyncSession,
        data: ChallengeData,
        *,
        source: str = "seed",
        proposed_challenge_id: str | None = None,
        predicted_solve_rate: float | None = None,
        predicted_time_ms: int | None = None,
        prediction_model: str | None = None,
    ) -> None:
        """Insert a new challenge row, or update the matching one in place.
        Postgres ON CONFLICT keeps the upsert atomic; the stub-only test path
        never calls this."""
        now = datetime.datetime.now(datetime.UTC)
        values = {
            "id": data.id,
            "topic": data.topic.value,
            "difficulty": data.difficulty.value,
            "title": data.title,
            "prompt": data.prompt,
            "constraints": list(data.constraints),
            "examples": list(data.examples),
            "source": source,
            "proposed_challenge_id": proposed_challenge_id,
            "predicted_solve_rate": predicted_solve_rate,
            "predicted_time_ms": predicted_time_ms,
            "prediction_model": prediction_model,
        }
        stmt = pg_insert(Challenge).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Challenge.id],
            set_={
                "topic": stmt.excluded.topic,
                "difficulty": stmt.excluded.difficulty,
                "title": stmt.excluded.title,
                "prompt": stmt.excluded.prompt,
                "constraints": stmt.excluded.constraints,
                "examples": stmt.excluded.examples,
                "source": stmt.excluded.source,
                "proposed_challenge_id": stmt.excluded.proposed_challenge_id,
                "predicted_solve_rate": stmt.excluded.predicted_solve_rate,
                "predicted_time_ms": stmt.excluded.predicted_time_ms,
                "prediction_model": stmt.excluded.prediction_model,
                "updated_at": now,
            },
        )
        await db.execute(stmt)
