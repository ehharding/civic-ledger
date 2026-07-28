"use client";

import type { JSX } from "react";
import { useEffect } from "react";

/**
 * The app's error boundary.
 *
 * Renders a generic message and nothing else. The underlying error — which can carry request details, upstream response
 * bodies, or fragments of a URL containing the API key — is never put in the DOM. It is logged instead, so it stays
 * fully available in server and function logs where only operators can read it.
 *
 * @param error - The caught error, including Next's `digest` for correlating it with a server log entry.
 * @param reset - Re-renders the failed segment. Worth offering because most failures here are transient upstream ones,
 *   where simply trying again genuinely works.
 * @returns The error page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect((): void => {
    console.error("[error-boundary]", error);
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
