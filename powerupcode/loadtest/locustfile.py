"""Load-test scenarios for PowerUpCode.

Three User classes targeting the paths most likely to bend first:

  ReadPatternUser     - /next, /daily, /curriculum/me, /progress/me, /history
  AttemptSubmitUser   - GET /next then POST /attempt (Haiku + 4 DB writes)
  StripeWebhookFlood  - signed retry-storm POSTs against /api/billing/webhook

Install:   pip install -e ".[loadtest]"
Stack:     scripts/dev-up.ps1
Seed:      python loadtest/seed_users.py --count 50 --output loadtest/users.csv

Headless run (read pattern, 50 users for 2 minutes):
  locust -f loadtest/locustfile.py --user-classes ReadPatternUser \
    --host http://localhost:8000 -u 50 -r 5 --headless --run-time 2m \
    --csv reports/read

Webhook flood requires STRIPE_WEBHOOK_SECRET in env (same secret the API
verifies). Keep AttemptSubmitUser's user count low — Haiku rate-limits
the tier well before the API itself struggles.

Anonymous traffic isn't tested: almost every interesting endpoint is
behind get_current_user, so unauthenticated load misses the engine path,
user_progress contention, and dedupe-hash queries entirely.
"""
import csv
import json
import os
import random
import time
import uuid
from pathlib import Path

from locust import HttpUser, between, events, task

_USERS_CSV = Path(__file__).parent / "users.csv"


@events.init.add_listener
def _on_init(environment, **_kwargs):  # type: ignore[no-untyped-def]
    """Surface common misconfigurations as a single up-front error
    instead of a wall of failed requests."""
    if not _USERS_CSV.exists() and any(
        cls.__name__ in {"ReadPatternUser", "AttemptSubmitUser"}
        for cls in environment.user_classes
    ):
        environment.runner.quit()
        raise SystemExit(
            f"{_USERS_CSV} not found. Run:\n"
            f"  python loadtest/seed_users.py --count 50 --output {_USERS_CSV}"
        )


def _load_credentials() -> list[dict[str, str]]:
    if not _USERS_CSV.exists():
        return []
    with _USERS_CSV.open() as fh:
        return list(csv.DictReader(fh))


class _AuthedUser(HttpUser):
    """Shared base for scenarios that need a logged-in cookie jar."""

    abstract = True

    def on_start(self) -> None:
        creds = _load_credentials()
        if not creds:
            self.environment.runner.quit()
            raise SystemExit("No seeded users available. See loadtest/seed_users.py")
        # Pick a random row so concurrent locust workers spread across
        # the seeded user pool instead of all hammering loadtest-0.
        chosen = random.choice(creds)
        with self.client.post(
            "/api/auth/login",
            json={"email": chosen["email"], "password": chosen["password"]},
            name="login",
            catch_response=True,
        ) as res:
            if res.status_code != 200:
                res.failure(f"login failed: {res.status_code} {res.text[:200]}")
                self.environment.runner.quit()
                raise SystemExit(f"login failed for {chosen['email']}: {res.status_code}")


class ReadPatternUser(_AuthedUser):
    """Mimics a logged-in arcade user idly browsing.

    Hits the read-heavy endpoints in the same rough mix the dashboard +
    arcade pages produce. Goal: surface N+1 query patterns and connection-
    pool exhaustion before a real soft launch does."""

    wait_time = between(1.0, 3.0)

    @task(5)
    def fetch_next_challenge(self) -> None:
        self.client.get("/api/challenges/next", name="GET /challenges/next")

    @task(2)
    def fetch_daily(self) -> None:
        self.client.get("/api/challenges/daily", name="GET /challenges/daily")

    @task(2)
    def fetch_curriculum(self) -> None:
        self.client.get("/api/curriculum/me", name="GET /curriculum/me")

    @task(3)
    def fetch_progress(self) -> None:
        self.client.get("/api/progress/me", name="GET /progress/me")

    @task(2)
    def fetch_history(self) -> None:
        self.client.get("/api/progress/history", name="GET /progress/history")

    @task(1)
    def fetch_daily_leaderboard(self) -> None:
        self.client.get(
            "/api/challenges/daily/leaderboard",
            name="GET /challenges/daily/leaderboard",
        )


class AttemptSubmitUser(_AuthedUser):
    """Heaviest path: fetch /next, submit an attempt, repeat.

    Each submission triggers a Haiku call + writes to attempts,
    user_progress, and review_schedule. This is what'll fall over first
    under load — DB lock contention on the user_progress row, Haiku
    rate limits, or the dedupe-hash query."""

    wait_time = between(2.0, 5.0)

    _SOLUTIONS = [
        "def solve(*args):\n    return None\n",
        (
            "def solve(nums, target):\n"
            "    seen = {}\n"
            "    for i, n in enumerate(nums):\n"
            "        if target - n in seen:\n"
            "            return [seen[target - n], i]\n"
            "        seen[n] = i\n"
            "    return []\n"
        ),
        "class Solution:\n    def solve(self, x):\n        return x * 2\n",
    ]

    @task
    def fetch_and_submit(self) -> None:
        with self.client.get(
            "/api/challenges/next",
            name="GET /challenges/next",
            catch_response=True,
        ) as res:
            if res.status_code != 200:
                res.failure(f"next returned {res.status_code}")
                return
            challenge_id = res.json().get("id")
        if not challenge_id:
            return
        body = {
            "solution": random.choice(self._SOLUTIONS),
            "time_ms": random.randint(15_000, 180_000),
        }
        self.client.post(
            f"/api/challenges/{challenge_id}/attempt",
            json=body,
            name="POST /challenges/{id}/attempt",
        )


class StripeWebhookFlood(HttpUser):
    """Synthesizes Stripe-signed webhook deliveries to validate the
    idempotency claim: a single event_id, replayed N times concurrently,
    must be processed at most once.

    Sends a small pool of distinct events repeatedly so the
    processed_stripe_events ON CONFLICT path is exercised under
    contention. Requires STRIPE_WEBHOOK_SECRET in env."""

    wait_time = between(0.05, 0.2)

    _EVENT_POOL_SIZE = 5

    def on_start(self) -> None:
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        if not secret:
            self.environment.runner.quit()
            raise SystemExit(
                "STRIPE_WEBHOOK_SECRET not set in env. "
                "The webhook handler will reject every request without it."
            )
        self._secret = secret
        # A small pool so dedupe is exercised — most deliveries collide.
        self._events = [
            self._make_event(f"evt_loadtest_{i}") for i in range(self._EVENT_POOL_SIZE)
        ]

    @staticmethod
    def _make_event(event_id: str) -> dict:
        return {
            "id": event_id,
            "object": "event",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": f"sub_loadtest_{uuid.uuid4().hex[:12]}",
                    "customer": f"cus_loadtest_{uuid.uuid4().hex[:12]}",
                    "status": "active",
                    "current_period_end": int(time.time()) + 30 * 86400,
                    "metadata": {"user_id": "loadtest", "plan": "monthly"},
                }
            },
        }

    def _sign(self, payload: bytes) -> str:
        # Re-implement Stripe's webhook signature so we don't have to
        # import the stripe SDK just for one helper. Format mirrors
        # stripe.Webhook.construct_event's verifier.
        import hashlib
        import hmac

        ts = int(time.time())
        signed = f"{ts}.{payload.decode('utf-8')}".encode()
        v1 = hmac.new(self._secret.encode(), signed, hashlib.sha256).hexdigest()
        return f"t={ts},v1={v1}"

    @task
    def fire_event(self) -> None:
        evt = random.choice(self._events)
        payload = json.dumps(evt).encode("utf-8")
        sig = self._sign(payload)
        self.client.post(
            "/api/billing/webhook",
            data=payload,
            headers={
                "Stripe-Signature": sig,
                "Content-Type": "application/json",
            },
            name="POST /billing/webhook",
        )
