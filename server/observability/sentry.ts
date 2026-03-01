import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || "";

export function initServerSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
}

export function captureServerError(error: unknown, context?: Record<string, unknown>) {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v as any);
    }
    Sentry.captureException(error);
  });
}
