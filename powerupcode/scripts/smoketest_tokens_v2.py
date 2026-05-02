"""HTTP smoke for Tokens v2 + Daily Streak v2 endpoints.

Hits the live backend at http://localhost:8000 and walks the full
spend/earn loop for the v2 endpoints with a fresh test user. SMTP is
not configured in dev, so this script force-verifies the user via a
direct SQL UPDATE rather than going through the email link.

Stages (each prints PASS/FAIL with status code + ms):
  1. /openapi.json lists all 3 new endpoints
  2. Register fresh user (random suffix to avoid collisions)
  3. Force-verify via SQL
  4. Login (gets auth cookies)
  5. Initial GET /api/progress/me — confirms streak_shields field present and zero
  6. Buy-shield with zero balance → expect 402
  7. SQL-grant 5 tokens directly (simulates earn)
  8. Buy-shield happy path → expect 200, shields=1, balance=0
  9. SQL-grant 15 more tokens, buy 2 more shields, then attempt 4th → expect 409 (cap)
  10. Hit /api/boss-rush/{run_id}/extra-life and /api/interviews/{session_id}/time-freeze
      with bogus IDs → expect 404 (proves routes are registered behind auth)

Cleans up the test user on success unless --keep is passed.
"""
import argparse
import asyncio
import os
import secrets
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://localhost:8000")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5434/powerupcode",
)


class Smoke:
    def __init__(self) -> None:
        self.results: list[tuple[str, bool, str]] = []
        self.client = httpx.Client(base_url=BASE_URL, timeout=10.0)
        self.username = f"smoke_{secrets.token_hex(4)}"
        self.email = f"{self.username}@example.com"
        self.password = "smoke-test-pw-1234!"
        self.user_id: str | None = None

    def _record(self, name: str, ok: bool, detail: str) -> None:
        marker = "PASS" if ok else "FAIL"
        print(f"  [{marker}] {name} — {detail}")
        self.results.append((name, ok, detail))

    def _stage(self, name: str, fn) -> None:
        t0 = time.perf_counter()
        try:
            fn()
        except AssertionError as e:
            elapsed = (time.perf_counter() - t0) * 1000
            self._record(name, False, f"{e} ({elapsed:.0f}ms)")
        except Exception as e:  # noqa: BLE001
            elapsed = (time.perf_counter() - t0) * 1000
            self._record(name, False, f"{type(e).__name__}: {e} ({elapsed:.0f}ms)")

    # ----- stages -----

    def stage_openapi(self) -> None:
        r = self.client.get("/openapi.json")
        assert r.status_code == 200, f"got {r.status_code}"
        spec = r.json()
        paths = set(spec["paths"].keys())
        required = {
            "/api/progress/daily-streak/shield",
            "/api/boss-rush/{run_id}/extra-life",
            "/api/interviews/{session_id}/time-freeze",
        }
        missing = required - paths
        assert not missing, f"missing: {missing}"
        self._record("openapi has all v2 endpoints", True, ", ".join(sorted(required)))

    def stage_register(self) -> None:
        r = self.client.post(
            "/api/auth/register",
            json={"username": self.username, "email": self.email, "password": self.password},
        )
        assert r.status_code in (200, 201), f"got {r.status_code}: {r.text[:200]}"
        self._record("register", True, f"{self.username}")

    async def _force_verify_async(self) -> None:
        engine = create_async_engine(DATABASE_URL, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as db:
            row = await db.execute(
                text("UPDATE users SET is_verified=TRUE WHERE email=:e RETURNING id"),
                {"e": self.email},
            )
            user_id = row.scalar_one()
            self.user_id = user_id
            await db.commit()
        await engine.dispose()

    def stage_force_verify(self) -> None:
        asyncio.run(self._force_verify_async())
        assert self.user_id, "no user id"
        self._record("force-verify via SQL", True, f"user_id={self.user_id[:8]}…")

    def stage_login(self) -> None:
        r = self.client.post(
            "/api/auth/login",
            json={"email": self.email, "password": self.password},
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        # Auth cookies persist on the client automatically
        self._record("login", True, "cookies set")

    def stage_initial_progress(self) -> None:
        r = self.client.get("/api/progress/me")
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert "streak_shields" in body, f"streak_shields missing: {sorted(body.keys())}"
        assert body["streak_shields"] == 0, body["streak_shields"]
        assert body["token_balance"] == 0, body["token_balance"]
        self._record(
            "GET /progress/me has streak_shields=0",
            True,
            f"balance={body['token_balance']} shields={body['streak_shields']}",
        )

    def stage_buy_shield_no_balance(self) -> None:
        r = self.client.post("/api/progress/daily-streak/shield")
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:200]}"
        self._record("buy-shield with no balance → 402", True, r.json().get("detail", ""))

    async def _grant_tokens_async(self, n: int) -> None:
        engine = create_async_engine(DATABASE_URL, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as db:
            # Need a user_progress row to grant against. Create-or-update.
            await db.execute(
                text(
                    "INSERT INTO user_progress (user_id, total_xp, level, "
                    "streak_days, daily_streak_days, token_balance, streak_shields, topics) "
                    "VALUES (:uid, 0, 1, 0, 0, :n, 0, '{}') "
                    "ON CONFLICT (user_id) DO UPDATE SET "
                    "token_balance = user_progress.token_balance + :n"
                ),
                {"uid": self.user_id, "n": n},
            )
            await db.commit()
        await engine.dispose()

    def stage_grant_5_tokens(self) -> None:
        asyncio.run(self._grant_tokens_async(5))
        self._record("SQL-grant +5 tokens", True, "")

    def stage_buy_shield_happy(self) -> None:
        r = self.client.post("/api/progress/daily-streak/shield")
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body["streak_shields"] == 1, body
        assert body["token_balance"] == 0, body
        self._record(
            "buy-shield happy path → 200",
            True,
            f"shields={body['streak_shields']} balance={body['token_balance']}",
        )

    def stage_grant_and_fill_to_cap(self) -> None:
        asyncio.run(self._grant_tokens_async(15))  # 5 -> 20 minus already-spent 5 = 15
        # Buy 2 more (now 1 + 2 = 3, at cap)
        for _ in range(2):
            r = self.client.post("/api/progress/daily-streak/shield")
            assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        # Verify at cap
        r = self.client.get("/api/progress/me")
        body = r.json()
        assert body["streak_shields"] == 3, body
        # Fourth purchase should 409
        r = self.client.post("/api/progress/daily-streak/shield")
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:200]}"
        self._record(
            "fill to cap then 4th buy → 409",
            True,
            f"detail: {r.json().get('detail', '')[:60]}",
        )

    def stage_extra_life_404(self) -> None:
        r = self.client.post("/api/boss-rush/nonexistent-run-id/extra-life")
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        self._record("extra-life on missing run → 404", True, "")

    def stage_time_freeze_404(self) -> None:
        r = self.client.post("/api/interviews/nonexistent-session-id/time-freeze")
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        self._record("time-freeze on missing session → 404", True, "")

    # ----- cleanup -----

    async def _cleanup_async(self) -> None:
        if not self.user_id:
            return
        engine = create_async_engine(DATABASE_URL, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as db:
            for table in (
                "user_progress",
                "sessions",
                "users",
            ):
                try:
                    await db.execute(
                        text(f"DELETE FROM {table} WHERE user_id = :uid OR id = :uid"),
                        {"uid": self.user_id},
                    )
                except Exception:  # noqa: BLE001
                    pass  # best-effort
            await db.commit()
        await engine.dispose()

    def cleanup(self) -> None:
        try:
            asyncio.run(self._cleanup_async())
        except Exception as e:  # noqa: BLE001
            print(f"  cleanup warning: {e}")

    # ----- driver -----

    def run(self, keep: bool) -> int:
        print(f"Tokens v2 + Daily Streak v2 smoke against {BASE_URL}")
        print(f"  test user: {self.username}")
        print()
        self._stage("openapi", self.stage_openapi)
        self._stage("register", self.stage_register)
        self._stage("force_verify", self.stage_force_verify)
        self._stage("login", self.stage_login)
        self._stage("initial_progress", self.stage_initial_progress)
        self._stage("buy_shield_no_balance", self.stage_buy_shield_no_balance)
        self._stage("grant_5_tokens", self.stage_grant_5_tokens)
        self._stage("buy_shield_happy", self.stage_buy_shield_happy)
        self._stage("grant_and_fill_to_cap", self.stage_grant_and_fill_to_cap)
        self._stage("extra_life_404", self.stage_extra_life_404)
        self._stage("time_freeze_404", self.stage_time_freeze_404)
        self.client.close()

        passed = sum(1 for _, ok, _ in self.results if ok)
        total = len(self.results)
        all_ok = passed == total
        print()
        print(f"{passed}/{total} stages passed")

        if all_ok and not keep:
            self.cleanup()
            print("test user cleaned up")
        elif keep:
            print(f"keeping test user {self.username} (--keep)")
        else:
            print(f"failures — keeping test user {self.username} for inspection")

        return 0 if all_ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", action="store_true", help="keep test user after success")
    args = parser.parse_args()
    return Smoke().run(args.keep)


if __name__ == "__main__":
    sys.exit(main())
