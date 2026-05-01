import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

// withSentryConfig auto-uploads source maps after the build when
// SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT are present in
// the environment. Without the token (local dev, PRs from forks)
// the plugin no-ops and the build still succeeds.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Pin to the git SHA in CI so each deploy is a distinct Sentry
  // release; falls back to the plugin's auto-generated value when
  // unset.
  release: {
    name: process.env.SENTRY_RELEASE,
  },
  // Keep build logs clean unless something actually fails.
  silent: true,
  // Don't ship source maps to the public site — Sentry has its
  // own copy via the upload, and exposing them on the CDN gives
  // attackers more to chew on.
  hideSourceMaps: true,
  // Strip Sentry's debug bundles in production for smaller payload.
  disableLogger: true,
  // Tunnel browser events through /monitoring on our own domain so
  // ad blockers don't drop them. Adds a Next route at build time.
  tunnelRoute: "/monitoring",
  // Upload all source files, including framework chunks, so server-
  // side error frames also resolve.
  widenClientFileUpload: true,
});
