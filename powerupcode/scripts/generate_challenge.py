"""
Generate AI challenge candidates and write them to proposed_challenges.

Usage (from powerupcode/):
    python scripts/generate_challenge.py --topic graphs --difficulty medium
    python scripts/generate_challenge.py --topic arrays --difficulty easy --count 5
    python scripts/generate_challenge.py --topic trees --difficulty hard --guidance "binary search trees specifically"

Each generated candidate is validated against services.content.schemas.
GeneratedChallenge and inserted with status='pending'. Run
scripts/review_proposed_challenges.py to walk the queue and approve
or reject them.

Requires:
  - ANTHROPIC_API_KEY in the environment
  - services/engine_core/ present locally (gitignored, so this script
    only works on machines that have the proprietary engine)
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import ProposedChallenge  # noqa: E402
from services.engine.interface import Difficulty, Topic  # noqa: E402

# engine_core is gitignored — import here defers the failure to runtime
# with a clear message instead of an unfindable ImportError at startup.
try:
    from services.engine_core.challenge_generator import (  # noqa: E402
        GenerationError,
        generate_challenge,
    )
except ImportError as exc:  # pragma: no cover
    print(
        "engine_core not available — this script needs the proprietary "
        "engine module. Are you running it on a machine without "
        f"services/engine_core/?\n\nRoot cause: {exc}",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc


async def _generate_one(
    topic: Topic, difficulty: Difficulty, guidance: str | None
) -> ProposedChallenge | None:
    try:
        candidate = await generate_challenge(
            topic, difficulty, extra_guidance=guidance
        )
    except GenerationError as exc:
        print(f"  generation failed: {exc}", file=sys.stderr)
        return None

    return ProposedChallenge(
        topic=candidate.topic.value,
        difficulty=candidate.difficulty.value,
        title=candidate.title,
        prompt=candidate.prompt,
        constraints=candidate.constraints,
        examples=[ex.model_dump() for ex in candidate.examples],
        sample_solution=candidate.sample_solution,
        generation_model="claude-haiku-4-5-20251001",
    )


async def _run(
    topic: Topic, difficulty: Difficulty, count: int, guidance: str | None
) -> int:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    inserted = 0
    async with Session() as db:
        for i in range(count):
            print(f"[{i + 1}/{count}] generating {topic.value}/{difficulty.value}...")
            candidate = await _generate_one(topic, difficulty, guidance)
            if candidate is None:
                continue
            db.add(candidate)
            await db.flush()
            print(f"  inserted candidate {candidate.id}: {candidate.title}")
            inserted += 1
        await db.commit()

    await engine.dispose()
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--topic",
        required=True,
        choices=[t.value for t in Topic],
        help="Topic for the generated challenge.",
    )
    parser.add_argument(
        "--difficulty",
        required=True,
        choices=[d.value for d in Difficulty],
        help="Difficulty tier.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="How many candidates to generate (default 1).",
    )
    parser.add_argument(
        "--guidance",
        default=None,
        help="Optional extra guidance appended to the prompt.",
    )
    args = parser.parse_args()

    inserted = asyncio.run(
        _run(
            Topic(args.topic),
            Difficulty(args.difficulty),
            args.count,
            args.guidance,
        )
    )
    print(f"\nDone. {inserted}/{args.count} candidate(s) inserted as pending.")


if __name__ == "__main__":
    main()
