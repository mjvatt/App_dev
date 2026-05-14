"""
Create invite codes for closed-beta registration.

Usage (from the powerupcode/ directory):

    # One code with default max_uses=1
    python scripts/create_invite_code.py

    # Twenty single-use codes, all with the same note
    python scripts/create_invite_code.py --count 20 --note "Founder friends batch 1"

    # One reusable code (e.g. for a launch post)
    python scripts/create_invite_code.py --code LAUNCH-2026 --max-uses 50

    # A batch of codes sharing a recognizable prefix
    python scripts/create_invite_code.py --count 10 --prefix FRIENDS

Codes are stored uppercase-normalized. Lookups during registration
normalize the same way, so users may type them in mixed case.
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Make `api` and `services` importable when running this script directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.user import InviteCode  # noqa: E402
from services.invites import (  # noqa: E402
    generate_code,
    is_valid_code_format,
    normalize_code,
)


async def _create_codes(
    *,
    code: str | None,
    max_uses: int,
    note: str | None,
    count: int,
    prefix: str | None,
) -> list[str]:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    created: list[str] = []
    async with Session() as db:
        for _ in range(count):
            if code is not None:
                candidate = normalize_code(code)
            else:
                candidate = generate_code(prefix=prefix)

            existing = await db.scalar(
                select(InviteCode).where(InviteCode.code == candidate)
            )
            if existing is not None:
                print(f"skip {candidate} (already exists)", file=sys.stderr)
                continue

            db.add(InviteCode(code=candidate, max_uses=max_uses, note=note))
            created.append(candidate)
        await db.commit()
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Create one or more invite codes.")
    parser.add_argument("--code", help="Specific code to insert (instead of generating).")
    parser.add_argument(
        "--max-uses",
        type=int,
        default=1,
        help="Maximum number of redemptions for the code(s). Default: 1.",
    )
    parser.add_argument("--note", help="Free-text note stored alongside the code.")
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Number of codes to generate. Ignored when --code is given. Default: 1.",
    )
    parser.add_argument(
        "--prefix",
        help="Optional prefix for generated codes (e.g. FRIENDS).",
    )
    args = parser.parse_args()

    if args.max_uses < 1:
        parser.error("--max-uses must be >= 1")
    if args.count < 1:
        parser.error("--count must be >= 1")
    if args.code is not None:
        if not is_valid_code_format(args.code):
            parser.error(
                "--code must be 4-64 chars of [A-Z0-9-] after normalization"
            )
        if args.count != 1:
            parser.error("--count is incompatible with --code")
        if args.prefix is not None:
            parser.error("--prefix is incompatible with --code")

    created = asyncio.run(
        _create_codes(
            code=args.code,
            max_uses=args.max_uses,
            note=args.note,
            count=args.count,
            prefix=args.prefix,
        )
    )

    for c in created:
        print(c)
    print(f"\nCreated {len(created)} invite code(s).", file=sys.stderr)


if __name__ == "__main__":
    main()
