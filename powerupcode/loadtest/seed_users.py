"""Pre-seed N verified, active users for load testing.

The load tests need real auth — anonymous traffic only exercises the
public surface and misses every endpoint behind get_current_user. This
script registers `loadtest-{i}@example.com` users, marks them verified,
and prints the credentials so locust can read them back via env.

Idempotent — re-running just refreshes the verified-state on existing
rows. Targets the local DB by default; override with DATABASE_URL.

Usage (from powerupcode/):
    python loadtest/seed_users.py --count 50
    python loadtest/seed_users.py --count 50 --output loadtest/users.csv
"""
import argparse
import asyncio
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.user import User  # noqa: E402

_PASSWORD = "loadtest-pw-1234"


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def _run(count: int, output: Path | None) -> None:
    db_engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(db_engine, expire_on_commit=False)

    rows: list[tuple[str, str, str]] = []  # (email, username, password)

    async with Session() as db:
        for i in range(count):
            email = f"loadtest-{i}@example.com"
            username = f"loadtest{i}"
            existing = await db.scalar(select(User).where(User.email == email))
            if existing is None:
                db.add(
                    User(
                        email=email,
                        username=username,
                        hashed_password=_hash(_PASSWORD),
                        is_active=True,
                        is_verified=True,
                    )
                )
            else:
                existing.is_active = True
                existing.is_verified = True
            rows.append((email, username, _PASSWORD))

        await db.commit()

    await db_engine.dispose()

    if output:
        with output.open("w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["email", "username", "password"])
            writer.writerows(rows)
        print(f"Wrote {len(rows)} users to {output}")
    else:
        print(f"Seeded {len(rows)} users. Sample credential:")
        print(f"  email={rows[0][0]}  password={_PASSWORD}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--count",
        type=int,
        default=50,
        help="How many test users to ensure exist (default 50).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional CSV file to write credentials into.",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.count, args.output))


if __name__ == "__main__":
    main()
