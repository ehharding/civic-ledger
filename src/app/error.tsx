"use client";

import Link from "next/link";
import type { JSX } from "react";
import { useEffect } from "react";

import { SiteShell } from "@/components/site-shell";

/**
 * The app's error boundary, rendered in place of any route segment whose render threw.
 *
 * Shows a generic message and nothing else. The underlying error — which can carry request details, upstream response
 * bodies, or fragments of a URL containing the API key — is never put in the DOM. It is logged instead, so it stays
 * fully available in server and function logs where only operators can read it.
 *
 * Wrapped in {@link SiteShell} for the reason `not-found.tsx` already was: these are the two pages a reader arrives at
 * by *failing* to arrive somewhere, and a failure page carrying no navigation is a dead end whose only remaining move
 * is the Back button. The chrome is also what makes "Try Again" an offer rather than an ultimatum — if the segment is
 * genuinely broken rather than transiently so, the header is still there to leave by. This boundary renders inside the
 * root layout, so the shell it draws is the same one every working route draws.
 *
 * Named for the file it is. `global-error.tsx` is a different boundary — it replaces the root layout itself, renders
 * its own `<html>` and `<body>`, and catches only what this one cannot — and a component here called `GlobalError` read
 * as that one.
 *
 * @param error - The caught error, including Next's `digest` for correlating it with a server log entry.
 * @param reset - Re-renders the failed segment. Worth offering because most failures here are transient upstream ones,
 *   where simply trying again genuinely works.
 * @returns The error page.
 */
export default function RouteError({
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
    <SiteShell>
      <section className="empty-state">
        <p className="eyebrow">Something Went Wrong</p>
        <h1>We Could Not Load This Civic Record.</h1>
        <p>Most failures here are a passing upstream one, so trying again often works.</p>
        <div className="empty-state__actions">
          <button type="button" className="button button--primary" onClick={reset}>
            Try Again
          </button>
          <Link href="/bills" className="button button--quiet">
            Browse Bills
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
