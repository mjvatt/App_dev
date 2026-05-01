"""Tests for the server-side PostHog wrapper.

The wrapper has two responsibilities: no-op when the key is unset, and
swallow exceptions when the underlying client raises. We don't test the
PostHog SDK itself.
"""
from unittest.mock import MagicMock, patch

import pytest

import services.analytics as analytics_module


@pytest.fixture(autouse=True)
def _reset_analytics_singleton():
    """Force the module to re-initialize on each test so config patches
    take effect."""
    analytics_module.reset_for_tests()
    yield
    analytics_module.reset_for_tests()


def test_capture_is_noop_when_key_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analytics_module.settings, "posthog_key", "")
    # Should not raise, should not construct a Posthog client.
    with patch.object(analytics_module, "Posthog") as fake_ctor:
        analytics_module.capture("user-1", "some.event", {"foo": "bar"})
        fake_ctor.assert_not_called()


def test_capture_dispatches_when_key_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analytics_module.settings, "posthog_key", "phc_test")
    fake_client = MagicMock()
    with patch.object(analytics_module, "Posthog", return_value=fake_client) as fake_ctor:
        analytics_module.capture("user-1", "some.event", {"foo": "bar"})
        fake_ctor.assert_called_once()
        fake_client.capture.assert_called_once_with(
            distinct_id="user-1",
            event="some.event",
            properties={"foo": "bar"},
        )


def test_capture_with_no_properties_passes_empty_dict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(analytics_module.settings, "posthog_key", "phc_test")
    fake_client = MagicMock()
    with patch.object(analytics_module, "Posthog", return_value=fake_client):
        analytics_module.capture("user-1", "some.event")
        fake_client.capture.assert_called_once_with(
            distinct_id="user-1",
            event="some.event",
            properties={},
        )


def test_capture_swallows_client_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analytics_module.settings, "posthog_key", "phc_test")
    fake_client = MagicMock()
    fake_client.capture.side_effect = RuntimeError("network blew up")
    with patch.object(analytics_module, "Posthog", return_value=fake_client):
        # Must not propagate; an analytics outage cannot fail a request.
        analytics_module.capture("user-1", "some.event")


def test_init_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analytics_module.settings, "posthog_key", "phc_test")
    with patch.object(analytics_module, "Posthog") as fake_ctor:
        fake_ctor.return_value = MagicMock()
        analytics_module.capture("u", "e1")
        analytics_module.capture("u", "e2")
        analytics_module.capture("u", "e3")
        # Three captures, but only one client constructed.
        assert fake_ctor.call_count == 1


def test_event_constants_are_strings() -> None:
    """Sanity check that the event names are the kind of value PostHog expects."""
    assert analytics_module.Events.SubscriptionActivated == "subscription.activated"
    assert analytics_module.Events.SubscriptionCanceled == "subscription.canceled"
    assert analytics_module.Events.AttemptFirstPass == "attempt.first_pass"
