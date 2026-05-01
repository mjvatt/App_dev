"""Load O*NET occupation index into Postgres with embeddings.

Reads the JSON index built by services.ingest.onet, computes embeddings
locally via fastembed, and upserts rows into onet_occupations.

CLI:
    python -m services.ingest.pgvector_load [--limit N] [--batch-size N]

Pre-requisites:
    - Postgres running (docker compose up -d).
    - Migrations applied (alembic upgrade head).
    - O*NET JSON index built (python -m services.ingest.onet build).
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from services.ingest.onet import OccupationDetail, load_index
from services.retrieval.db_models import OnetOccupation
from services.retrieval.embeddings import (
    DEFAULT_MODEL,
    build_occupation_embedding_text,
    embed_many,
)
from services.retrieval.store import session as db_session


def _embedding_text(o: OccupationDetail) -> str:
    return build_occupation_embedding_text(
        title=o.title,
        description=o.description,
        top_skills=[s.name for s in o.top_skills],
        top_knowledge=[k.name for k in o.top_knowledge],
        job_zone=o.job_zone,
        job_zone_summary=o.job_zone_summary,
        core_tasks=o.core_tasks,
    )


async def load(limit: int | None = None, batch_size: int = 64) -> int:
    print("[pgvector] loading O*NET index from JSON cache...")
    idx = load_index()
    occupations = list(idx.occupations.values())
    if limit:
        occupations = occupations[:limit]
    print(
        f"[pgvector] embedding {len(occupations)} occupations with {DEFAULT_MODEL}..."
    )

    written = 0
    async with db_session() as session:
        for start in range(0, len(occupations), batch_size):
            batch = occupations[start : start + batch_size]
            texts = [_embedding_text(o) for o in batch]
            vectors = embed_many(texts)
            rows = [
                {
                    "soc_code": o.soc_code,
                    "title": o.title,
                    "description": o.description,
                    "job_zone": o.job_zone,
                    "job_zone_summary": o.job_zone_summary,
                    "top_skills": [
                        {"name": s.name, "importance": s.importance} for s in o.top_skills
                    ],
                    "top_knowledge": [
                        {"name": k.name, "importance": k.importance} for k in o.top_knowledge
                    ],
                    "core_tasks": o.core_tasks,
                    "embedding_text": txt,
                    "embedding": vec,
                    "embedding_model": DEFAULT_MODEL,
                }
                for o, txt, vec in zip(batch, texts, vectors)
            ]
            stmt = pg_insert(OnetOccupation).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["soc_code"],
                set_={
                    "title": stmt.excluded.title,
                    "description": stmt.excluded.description,
                    "job_zone": stmt.excluded.job_zone,
                    "job_zone_summary": stmt.excluded.job_zone_summary,
                    "top_skills": stmt.excluded.top_skills,
                    "top_knowledge": stmt.excluded.top_knowledge,
                    "core_tasks": stmt.excluded.core_tasks,
                    "embedding_text": stmt.excluded.embedding_text,
                    "embedding": stmt.excluded.embedding,
                    "embedding_model": stmt.excluded.embedding_model,
                    "indexed_at": func.now(),
                },
            )
            await session.execute(stmt)
            written += len(rows)
            print(f"[pgvector]   {written}/{len(occupations)}")
        await session.commit()
    print(f"[pgvector] done. {written} rows upserted.")
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pgvector_load")
    parser.add_argument(
        "--limit", type=int, default=None, help="Process only the first N occupations."
    )
    parser.add_argument("--batch-size", type=int, default=64, help="Embedding batch size.")
    args = parser.parse_args(argv)
    asyncio.run(load(limit=args.limit, batch_size=args.batch_size))
    return 0


if __name__ == "__main__":
    sys.exit(main())
