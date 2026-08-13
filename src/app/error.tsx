"use client";

import * as Sentry from "@sentry/nextjs";
import type { JSX } from "react";
import { useEffect } from "react";

/**
 * The app's error boundary.
 *
 * Renders a generic message and nothing else. The underlying error — which can carry request details, upstream response
 * bodies, or fragments of a URL containing the API key — is never put in the DOM. It is logged instead, so it stays
 * fully available in server and function logs where only operators can read it.
 *
 * It is also reported to Sentry, which is the same decision as the log line above rather than a different one: an
 * operator-only channel, chosen because the alternative is a failure nobody hears about until a reader reports it. What
 * that channel is allowed to carry is not left to the SDK's defaults — see `src/lib/observability/redact.ts`, which
 * strips the API key and the reader's query string from every event before it leaves.
 *
 * @param error - The caught error, including Next's `digest` for correlating it with a server log entry.
 * @param reset - Re-renders the failed segment. Worth offering because most failures here are transient upstream ones,
 *   where simply trying again genuinely works.
 * @returns The error page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect((): void => {
    console.error("[error-boundary]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="error-page">
      <p className="eyebrow">Something Went Wrong</p>
      <h1>We Could Not Load This Civic Record.</h1>
      <button type="button" className="button button--primary" onClick={reset}>
        Try Again
      </button>
    </main>
  );
}
