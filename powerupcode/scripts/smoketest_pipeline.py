"""End-to-end smoke test for the Phase C content pipeline.

Walks every stage against the live local DB:
  1. pre-flight  (DB reachable, ANTHROPIC_API_KEY present)
  2. generate    (Haiku call -> validated GeneratedChallenge)
  3. insert      (proposed_challenges row, status='pending')
  4. approve     (mint slug id, write to challenges, status='approved')
  5. repo read   (ChallengeRepository.get returns the new row)
  6. repo filter (list_filtered with the same topic+difficulty includes it)
  7. engine read (HaikuEngine.get_challenge returns it via the repo)

Each stage prints PASS/FAIL with timing. On success the test rows are
deleted unless --keep is passed. On failure the rows are preserved so
Panda can inspect them.

Usage (from powerupcode/):
    python scripts/smoketest_pipeline.py
    python scripts/smoketest_pipeline.py --topic graphs --difficulty medium
    python scripts/smoketest_pipeline.py --keep        # leave artifacts behind

Requires:
  - ANTHROPIC_API_KEY in the environment
  - services/engine_core/ checked out locally (gitignored)
  - alembic upgrade head + (ideally) seed_challenges_from_bank.py already run
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from api.config import settings  # noqa: E402
from api.models.challenge import Challenge, ProposedChallenge  # noqa: E402
from services.engine import get_engine  # noqa: E402
from services.engine.interface import Difficulty, Topic  # noqa: E402
from services.engine.repository import ChallengeRepository  # noqa: E402

try:
    from services.engine_core.challenge_generator import (  # noqa: E402
        GenerationError,
        generate_challenge,
    )
except ImportError as exc:
    raise SystemExit(
        "engine_core.challenge_generator is not available. This smoke "
        "test must run on a machine with the private engine_core package "
        "checked out."
    ) from exc

# review_proposed_challenges._approve is the canonical approval routine;
# the smoke test calls it directly so generator->approve stays consistent
# with the interactive CLI.
from scripts.review_proposed_challenges import _approve  # noqa: E402

_PASS = "PASS"
_FAIL = "FAIL"


def _print_step(name: str, ok: bool, elapsed_ms: int, detail: str = "") -> None:
    label = _PASS if ok else _FAIL
    line = f"  [{label}] {name}  ({elapsed_ms} ms)"
    if detail:
        line += f"  -- {detail}"
    print(line)


async def _preflight() -> tuple[bool, str]:
    if not os.getenv("ANTHROPIC_API_KEY"):
        return False, "ANTHROPIC_API_KEY is not set"
    try:
        engine = create_async_engine(settings.database_url, echo=False)
        async with engine.connect():
            pass
        await engine.dispose()
    except Exception as exc:
        return False, f"DB unreachable: {exc}"
    return True, ""


async def _delete_artifacts(
    db: AsyncSession,
    proposed_id: str | None,
    approved_id: str | None,
) -> None:
    if approved_id:
        await db.execute(delete(Challenge).where(Challenge.id == approved_id))
    if proposed_id:
        await db.execute(
            delete(ProposedChallenge).where(ProposedChallenge.id == proposed_id)
        )
    await db.commit()


async def _run(topic: Topic, difficulty: Difficulty, keep: bool) -> int:
    print(f"\nSmoke test: {topic.value} / {difficulty.value}")
    print("=" * 60)

    proposed_id: str | None = None
    approved_id: str | None = None
    all_passed = True

    # 1. pre-flight
    t0 = time.monotonic()
    ok, detail = await _preflight()
    _print_step("preflight", ok, int((time.monotonic() - t0) * 1000), detail)
    if not ok:
        return 1

    db_engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    repo = ChallengeRepository()

    async with Session() as db:
        try:
            # 2. generate
            t0 = time.monotonic()
            try:
                generated = await generate_challenge(topic, difficulty)
                ok = True
                detail = f"title={generated.title!r}"
            except GenerationError as exc:
                ok = False
                detail = str(exc)
            _print_step("generate", ok, int((time.monotonic() - t0) * 1000), detail)
            if not ok:
                return 1

            # 3. insert as pending
            t0 = time.monotonic()
            proposed = ProposedChallenge(
                topic=generated.topic.value,
                difficulty=generated.difficulty.value,
                title=generated.title,
                prompt=generated.prompt,
                constraints=generated.constraints,
                examples=[ex.model_dump() for ex in generated.examples],
                sample_solution=generated.sample_solution,
                generation_model="claude-haiku-4-5-20251001",
            )
            db.add(proposed)
            await db.flush()
            proposed_id = proposed.id
            await db.commit()
            _print_step(
                "insert pending",
                True,
                int((time.monotonic() - t0) * 1000),
                f"proposed_id={proposed_id}",
            )

            # 4. approve (programmatic — same routine the CLI uses)
            t0 = time.monotonic()
            # Reload the proposed row inside this session so SQLA tracks it.
            proposed = (
                await db.execute(
                    select(ProposedChallenge).where(
                        ProposedChallenge.id == proposed_id
                    )
                )
            ).scalar_one()
            approved_id = await _approve(db, repo, proposed, used_in_session=set())
            await db.commit()
            _print_step(
                "approve",
                True,
                int((time.monotonic() - t0) * 1000),
                f"challenge_id={approved_id}",
            )

            # 5. repo.get returns the new row
            t0 = time.monotonic()
            fetched = await repo.get(db, approved_id)
            ok = fetched is not None and fetched.id == approved_id
            _print_step(
                "repo.get",
                ok,
                int((time.monotonic() - t0) * 1000),
                f"title={fetched.title!r}" if fetched else "got None",
            )
            all_passed = all_passed and ok

            # 6. repo.list_filtered includes it
            t0 = time.monotonic()
            pool = await repo.list_filtered(db, topic=topic, difficulty=difficulty)
            ok = any(c.id == approved_id for c in pool)
            _print_step(
                "repo.list_filtered",
                ok,
                int((time.monotonic() - t0) * 1000),
                f"pool size={len(pool)}",
            )
            all_passed = all_passed and ok

            # 7. engine.get_challenge (full HaikuEngine -> repo path)
            t0 = time.monotonic()
            engine_inst = get_engine()
            via_engine = await engine_inst.get_challenge(db, approved_id)
            ok = via_engine is not None and via_engine.id == approved_id
            _print_step(
                "engine.get_challenge",
                ok,
                int((time.monotonic() - t0) * 1000),
                "" if ok else "got None",
            )
            all_passed = all_passed and ok

        finally:
            if not keep and all_passed:
                await _delete_artifacts(db, proposed_id, approved_id)
                print("\nCleanup: test rows removed.")
            elif keep:
                print(
                    f"\nKept artifacts: proposed_id={proposed_id}  "
                    f"challenge_id={approved_id}"
                )
            else:
                print(
                    f"\nFailure: artifacts preserved for inspection.  "
                    f"proposed_id={proposed_id}  challenge_id={approved_id}"
                )

    await db_engine.dispose()
    print()
    return 0 if all_passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--topic",
        default=Topic.ARRAYS.value,
        choices=[t.value for t in Topic],
    )
    parser.add_argument(
        "--difficulty",
        default=Difficulty.EASY.value,
        choices=[d.value for d in Difficulty],
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Leave the test rows behind for inspection.",
    )
    args = parser.parse_args()

    exit_code = asyncio.run(
        _run(Topic(args.topic), Difficulty(args.difficulty), args.keep)
    )
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
