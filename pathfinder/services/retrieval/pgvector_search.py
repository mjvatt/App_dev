from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.retrieval.db_models import OnetOccupation


@dataclass
class SimilarOccupation:
    soc_code: str
    title: str
    description: str
    job_zone: int | None
    distance: float


async def find_similar_occupations(
    session: AsyncSession,
    query_vector: list[float],
    *,
    k: int = 10,
    min_job_zone: int | None = None,
    max_job_zone: int | None = None,
) -> list[SimilarOccupation]:
    distance = OnetOccupation.embedding.cosine_distance(query_vector).label("distance")
    stmt = (
        select(
            OnetOccupation.soc_code,
            OnetOccupation.title,
            OnetOccupation.description,
            OnetOccupation.job_zone,
            distance,
        )
        .order_by(distance)
        .limit(k)
    )
    if min_job_zone is not None:
        stmt = stmt.where(OnetOccupation.job_zone >= min_job_zone)
    if max_job_zone is not None:
        stmt = stmt.where(OnetOccupation.job_zone <= max_job_zone)
    rows = (await session.execute(stmt)).all()
    return [
        SimilarOccupation(
            soc_code=row.soc_code,
            title=row.title,
            description=row.description,
            job_zone=row.job_zone,
            distance=float(row.distance),
        )
        for row in rows
    ]
