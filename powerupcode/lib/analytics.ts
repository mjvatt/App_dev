"use client";

import posthog from "posthog-js";

let _initialized = false;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com";

/**
 * Initialize PostHog. Safe to call repeatedly; subsequent calls no-op.
 * Returns true if analytics is live, false otherwise (missing key,
 * disabled in dev, or running on the server).
 */
export function initAnalytics(): boolean {
  if (_initialized) return true;
  if (typeof window === "undefined") return false;
  if (!KEY) return false;

  posthog.init(KEY, {
    api_host: HOST,
    // Don't autocapture: we ship explicit events via track() so we never
    // accidentally exfiltrate Monaco editor contents, password fields,
    // or other sensitive DOM nodes.
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage",
    disable_session_recording: true,
  });
  _initialized = true;
  return true;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!_initialized) return;
  posthog.capture(event, props);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!_initialized) return;
  posthog.identify(userId, traits);
}

export function resetIdentity(): void {
  if (!_initialized) return;
  posthog.reset();
}

// Stable event name constants so callsites stay consistent.
export const Events = {
  RegisterCompleted: "register.completed",
  LoginCompleted: "login.completed",
  Logout: "auth.logout",
  EmailVerified: "email.verified",
  ChallengeFetched: "challenge.fetched",
  AttemptSubmitted: "attempt.submitted",
  HintRequested: "hint.requested",
  CheckoutStarted: "checkout.started",
  EmailVerificationBlocked: "auth.email_verification_blocked",
} as const;
