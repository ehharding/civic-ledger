"use client";

import type { JSX } from "react";
import { useEffect } from "react";

/**
 * Next.js error boundary for the app.
 * Deliberately shows a generic message only — the underlying error (including any request details) is never rendered,
 * to avoid leaking anything sensitive to the client. It's still logged (never to the DOM) so it's visible in
 * server/function logs for debugging.
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
