"""
Walk the proposed_challenges queue, approve or reject each, and emit
Python snippets for the engine_core challenge bank.

Approving a candidate sets status='approved', stamps reviewed_at, and
prints a ready-to-paste ChallengeData(...) snippet using a slug-based
challenge id derived from the title (with a -2 / -3 suffix on
collisions). Rejecting just sets status='rejected' so the row is kept
for audit but no longer surfaces.

Usage (from powerupcode/):
    python scripts/review_proposed_challenges.py
    python scripts/review_proposed_challenges.py --topic graphs
    python scripts/review_proposed_challenges.py --export-only  # just emit snippets for already-approved
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import ProposedChallenge  # noqa: E402
from services.content.schemas import slugify  # noqa: E402


def _format_python_snippet(candidate: ProposedChallenge, challenge_id: str) -> str:
    """Emit a ChallengeData(...) literal ready to paste into
    services/engine_core/challenge_bank.py. Quotes are doubled to dodge
    string escaping headaches with the user-supplied prompt text."""
    indent = "        "
    constraints_lines = ",\n".join(
        f"{indent}    {repr(c)}" for c in candidate.constraints
    )
    examples_lines = ",\n".join(
        f"{indent}    {repr(ex)}" for ex in candidate.examples
    )

    return (
        f'    "{challenge_id}": ChallengeData(\n'
        f'        id="{challenge_id}",\n'
        f"        topic=Topic.{candidate.topic.upper()},\n"
        f"        difficulty=Difficulty.{candidate.difficulty.upper()},\n"
        f"        title={candidate.title!r},\n"
        f"        prompt={candidate.prompt!r},\n"
        f"        constraints=[\n{constraints_lines},\n        ],\n"
        f"        examples=[\n{examples_lines},\n        ],\n"
        f"    ),"
    )


def _print_candidate(candidate: ProposedChallenge) -> None:
    print()
    print("=" * 78)
    print(f"  {candidate.title}")
    print(f"  topic: {candidate.topic}    difficulty: {candidate.difficulty}")
    print(f"  candidate id: {candidate.id}")
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


async def _next_unique_id(
    db, base_slug: str, used_in_session: set[str]  # type: ignore[no-untyped-def]
) -> str:
    """Return base_slug, or base_slug-2 / -3 / ... if collision exists."""
    candidate = base_slug
    suffix = 2
    while True:
        clash_session = candidate in used_in_session
        clash_db = await db.scalar(
            select(ProposedChallenge.id).where(
                ProposedChallenge.approved_challenge_id == candidate
            )
        )
        if not clash_session and clash_db is None:
            return candidate
        candidate = f"{base_slug}-{suffix}"
        suffix += 1


async def _run(topic: str | None, export_only: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        if export_only:
            # Re-emit snippets for already-approved candidates.
            stmt = select(ProposedChallenge).where(
                ProposedChallenge.status == "approved"
            )
            if topic:
                stmt = stmt.where(ProposedChallenge.topic == topic)
            rows = (await db.execute(stmt)).scalars().all()
            print(f"\n# {len(rows)} approved candidate(s):\n")
            for row in rows:
                print(_format_python_snippet(row, row.approved_challenge_id or row.id))
                print()
            return

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
                base = slugify(row.title)
                challenge_id = await _next_unique_id(db, base, approved_in_session)
                approved_in_session.add(challenge_id)
                row.status = "approved"
                row.reviewed_at = datetime.now(UTC)
                row.approved_challenge_id = challenge_id
                print()
                print(
                    f"  Approved as id={challenge_id}. Snippet to paste into "
                    "services/engine_core/challenge_bank.py CHALLENGES dict:"
                )
                print()
                print(_format_python_snippet(row, challenge_id))
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
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Skip review prompt; re-emit Python snippets for already-approved rows.",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.topic, args.export_only))


if __name__ == "__main__":
    main()
