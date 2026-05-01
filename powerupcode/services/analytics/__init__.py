"""Server-side PostHog client for funnel and conversion events.

The frontend already emits acquisition + activation events client-side
via lib/analytics. This module covers the events the client cannot
reliably emit:
  - subscription state changes (Stripe webhook)
  - first-pass detection (requires a DB query the frontend doesn't run)

When POSTHOG_KEY is unset (dev/test/CI), capture() is a no-op so the
rest of the app runs unchanged.
"""
import logging
from typing import Any

from posthog import Posthog

from api.config import settings

logger = logging.getLogger(__name__)


class _Events:
    """Server-side event names. Mirror the client `Events` enum where the
    same logical event has both a client and server emission path."""

    SubscriptionActivated = "subscription.activated"
    SubscriptionCanceled = "subscription.canceled"
    AttemptFirstPass = "attempt.first_pass"


Events = _Events()


_client: Posthog | None = None
_initialized = False


def _ensure_initialized() -> None:
    global _client, _initialized
    if _initialized:
        return
    _initialized = True
    if not settings.posthog_key:
        logger.info("PostHog disabled: POSTHOG_KEY not set")
        return
    _client = Posthog(  # type: ignore[no-untyped-call]
        project_api_key=settings.posthog_key,
        host=settings.posthog_host or "https://us.posthog.com",
    )


def capture(
    distinct_id: str,
    event: str,
    properties: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget event capture. Swallows transport errors so an
    analytics outage cannot fail a request."""
    _ensure_initialized()
    if _client is None:
        return
    try:
        _client.capture(  # type: ignore[no-untyped-call]
            distinct_id=distinct_id,
            event=event,
            properties=properties or {},
        )
    except Exception:
        logger.exception("PostHog capture failed for event=%s", event)


def shutdown() -> None:
    """Flush queued events. Call from app shutdown hooks if you want a
    clean handoff; the SDK also flushes on process exit."""
    if _client is None:
        return
    try:
        _client.shutdown()  # type: ignore[no-untyped-call]
    except Exception:
        logger.exception("PostHog shutdown failed")


def reset_for_tests() -> None:
    """Drop the cached client so tests can flip POSTHOG_KEY between
    cases. Pytest-only; do not call from production code."""
    global _client, _initialized
    _client = None
    _initialized = False
