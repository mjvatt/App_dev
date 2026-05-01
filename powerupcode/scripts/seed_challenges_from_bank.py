"""One-shot seeder: load engine_core.challenge_bank.CHALLENGES into the
canonical challenges table.

Idempotent — repeated runs upsert each row. Safe to re-run after a fresh
DB drop. The engine_core package is gitignored, so this script can only
run on machines that have the private bank checked out (Panda's laptop,
not CI).

Usage (from powerupcode/):
    python scripts/seed_challenges_from_bank.py
    python scripts/seed_challenges_from_bank.py --dry-run
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from services.calibrator import HeuristicPredictor  # noqa: E402
from services.engine.repository import ChallengeRepository  # noqa: E402

try:
    from services.engine_core.challenge_bank import CHALLENGES
except ImportError as exc:
    raise SystemExit(
        "engine_core.challenge_bank is not available. This seed script "
        "must run on a machine with the private engine_core package "
        "checked out."
    ) from exc


async def _run(dry_run: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    repo = ChallengeRepository()
    predictor = HeuristicPredictor()

    async with Session() as db:
        if dry_run:
            print(f"[dry-run] would upsert {len(CHALLENGES)} challenge(s):")
            for cid, c in sorted(CHALLENGES.items()):
                print(f"  {cid}  ({c.topic.value}/{c.difficulty.value})  {c.title}")
            return

        for cid, data in sorted(CHALLENGES.items()):
            prediction = predictor.predict(data)
            await repo.upsert(
                db,
                data,
                source="seed",
                proposed_challenge_id=None,
                predicted_solve_rate=prediction.solve_rate,
                predicted_time_ms=prediction.time_ms,
                prediction_model=prediction.model_version,
            )
            print(f"  upserted {cid}")
        await db.commit()
        print(f"\nDone. {len(CHALLENGES)} challenge(s) seeded.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be upserted without touching the DB.",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.dry_run))


if __name__ == "__main__":
    main()
