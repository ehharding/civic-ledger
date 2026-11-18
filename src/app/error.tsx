"use client";

import * as Sentry from "@sentry/nextjs";
import type { JSX } from "react";
import { useEffect } from "react";

import { errorDigest, logError } from "@/lib/observability/log";

/** Props for {@link AppError}. */
type AppErrorProps = {
  /**
   * Whatever was thrown. A Server Component's failure arrives as an `Error` carrying Next's `digest`; a Client
   * Component's arrives as-is and need not be an `Error` at all, so nothing here reads it without narrowing.
   *
   * @see errorDigest
   */
  error: unknown;
  /**
   * Re-fetches and re-renders the failed segment. Worth offering because most failures here are transient upstream
   * ones — and it has to be `retry` rather than `reset`, which re-renders without re-fetching and so replays the same
   * failed payload.
   */
  retry: () => void;
};

/**
 * The app's error boundary.
 *
 * Renders a generic message and nothing else. The error itself — which can carry upstream bodies or a URL containing
 * the API key — never reaches the DOM. It goes to the log and to Sentry instead, both operator-only channels, and
 * `src/lib/observability/redact.ts` strips the key and the reader's query string from every event before it leaves.
 *
 * @param props - {@link AppErrorProps}.
 * @returns The error page.
 */
export default function AppError({ error, retry }: AppErrorProps): JSX.Element {
  useEffect((): void => {
    // Both, and in this order. `logError` records the fact with a `digest` an operator can match against the server log
    // line for the same failure; `captureException` files the stack that makes it fixable. A render crash is exactly
    // the case where the issue stream is the right destination — unlike an upstream failure, it is rare and novel.
    logError("Error boundary caught a render failure", {
      attributes: { event: "error-boundary.caught", digest: errorDigest(error) },
      cause: error,
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="error-page">
      <p className="eyebrow">Something Went Wrong</p>
      <h1>We Could Not Load This Civic Record.</h1>
      <button type="button" className="button button--primary" onClick={retry}>
        Try Again
      </button>
    </main>
  );
}
