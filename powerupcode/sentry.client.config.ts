import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? "development",
    // Auto-capture unhandled errors and rejections in the browser.
    // Performance + replay are off by default; turn them on per project
    // budget by setting NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0"
    ),
    // Avoid sending Monaco editor contents or password fields if a
    // breadcrumb ever picks them up.
    sendDefaultPii: false,
  });
}
