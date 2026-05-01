"""Walk the proposed_challenges queue, approve or reject each.

Approving a candidate sets status='approved', stamps reviewed_at and
approved_challenge_id, and inserts the new row directly into the
canonical challenges table. The candidate is live as soon as the
script commits — no deploy or paste required.

Rejecting just sets status='rejected' so the row is kept for audit
but no longer surfaces.

Usage (from powerupcode/):
    python scripts/review_proposed_challenges.py
    python scripts/review_proposed_challenges.py --topic graphs
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from api.config import settings  # noqa: E402
from api.models.challenge import Challenge, ProposedChallenge  # noqa: E402
from services.calibrator import (  # noqa: E402
    declared_vs_predicted_tier_gap,
    solve_rate_to_tier,
)
from services.content.schemas import slugify  # noqa: E402
from services.engine.interface import ChallengeData, Difficulty, Topic  # noqa: E402
from services.engine.repository import ChallengeRepository  # noqa: E402


def _print_candidate(candidate: ProposedChallenge) -> None:
    print()
    print("=" * 78)
    print(f"  {candidate.title}")
    print(f"  topic: {candidate.topic}    difficulty: {candidate.difficulty}")
    print(f"  candidate id: {candidate.id}")
    _print_calibration(candidate)
    print("-" * 78)
    print(candidate.prompt)
    print()
    print("Constraints:")
    for c in candidate.constraints:
        print(f"  - {c}")
    print()
    print("Examples:")
    for ex in candidate.examples:
        print(f"  in:  {ex.get('input')}")
        print(f"  out: {ex.get('output')}")
        print()
    print("Sample solution:")
    print(candidate.sample_solution)
    print("=" * 78)


def _print_calibration(candidate: ProposedChallenge) -> None:
    """Surface the calibrator's prediction and warn loudly when the
    declared difficulty disagrees with the bucketed prediction by 2+
    tiers. The reviewer still has the final call — we don't auto-block."""
    if candidate.predicted_solve_rate is None:
        return
    declared = Difficulty(candidate.difficulty)
    predicted_tier = solve_rate_to_tier(candidate.predicted_solve_rate)
    gap = declared_vs_predicted_tier_gap(declared, predicted_tier)
    seconds = (
        candidate.predicted_time_ms // 1000
        if candidate.predicted_time_ms is not None
        else None
    )
    label = "agrees" if gap == 0 else f"looks more like {predicted_tier.value}"
    line = (
        f"  calibrator: {candidate.predicted_solve_rate:.0%} solve rate, "
        f"~{seconds}s median  ({label})"
        if seconds is not None
        else (
            f"  calibrator: {candidate.predicted_solve_rate:.0%} solve rate  "
            f"({label})"
        )
    )
    print(line)
    if gap >= 2:
        print(f"  WARNING: declared='{declared.value}' but prediction "
              f"buckets to '{predicted_tier.value}' — investigate before approving.")


async def _next_unique_id(
    db: AsyncSession, base_slug: str, used_in_session: set[str]
) -> str:
    """Return base_slug, or base_slug-2 / -3 / ... if a row with that id
    already exists in the challenges table or was minted earlier in this
    same review session."""
    candidate = base_slug
    suffix = 2
    while True:
        clash_session = candidate in used_in_session
        clash_db = await db.scalar(
            select(Challenge.id).where(Challenge.id == candidate)
        )
        if not clash_session and clash_db is None:
            return candidate
        candidate = f"{base_slug}-{suffix}"
        suffix += 1


async def _approve(
    db: AsyncSession,
    repo: ChallengeRepository,
    candidate: ProposedChallenge,
    used_in_session: set[str],
) -> str:
    """Mint a unique challenge id, mark the proposal approved, and insert
    the live row into the challenges table. Returns the minted id."""
    base = slugify(candidate.title)
    challenge_id = await _next_unique_id(db, base, used_in_session)
    used_in_session.add(challenge_id)

    candidate.status = "approved"
    candidate.reviewed_at = datetime.now(UTC)
    candidate.approved_challenge_id = challenge_id

    data = ChallengeData(
        id=challenge_id,
        topic=Topic(candidate.topic),
        difficulty=Difficulty(candidate.difficulty),
        title=candidate.title,
        prompt=candidate.prompt,
        constraints=list(candidate.constraints),
        examples=list(candidate.examples),
    )
    await repo.upsert(
        db,
        data,
        source="ai",
        proposed_challenge_id=candidate.id,
        predicted_solve_rate=candidate.predicted_solve_rate,
        predicted_time_ms=candidate.predicted_time_ms,
        prediction_model=candidate.prediction_model,
    )
    return challenge_id


async def _run(topic: str | None) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    repo = ChallengeRepository()

    async with Session() as db:
        stmt = select(ProposedChallenge).where(
            ProposedChallenge.status == "pending"
        )
        if topic:
            stmt = stmt.where(ProposedChallenge.topic == topic)
        stmt = stmt.order_by(ProposedChallenge.created_at.asc())
        rows = (await db.execute(stmt)).scalars().all()

        if not rows:
            print("No pending proposed challenges.")
            return

        approved_in_session: set[str] = set()
        approved_count = 0
        rejected_count = 0
        skipped_count = 0

        for row in rows:
            _print_candidate(row)
            choice = input(
                "  [a]pprove  [r]eject  [s]kip  [q]uit  > "
            ).strip().lower()

            if choice == "q":
                print("Exiting; remaining candidates left as pending.")
                break
            if choice == "s" or not choice:
                skipped_count += 1
                continue
            if choice == "r":
                row.status = "rejected"
                row.reviewed_at = datetime.now(UTC)
                rejected_count += 1
                continue
            if choice == "a":
                challenge_id = await _approve(db, repo, row, approved_in_session)
                print()
                print(f"  Approved as id={challenge_id}. Live in challenges table.")
                approved_count += 1
                continue
            print("  unknown choice; treating as skip")
            skipped_count += 1

        await db.commit()
        print()
        print(
            f"Reviewed {approved_count + rejected_count + skipped_count}: "
            f"{approved_count} approved, {rejected_count} rejected, "
            f"{skipped_count} skipped."
        )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--topic",
        default=None,
        help="Only review candidates with this topic.",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.topic))


if __name__ == "__main__":
    main()
