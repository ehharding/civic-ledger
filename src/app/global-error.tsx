"use client";

import * as Sentry from "@sentry/nextjs";
import type { JSX } from "react";
import { useEffect } from "react";

import { errorDigest, logError } from "@/lib/observability/log";

import "./globals.css";

/** Props for {@link GlobalError}. */
type GlobalErrorProps = {
  /**
   * Whatever was thrown — not necessarily an `Error`, so it is narrowed before anything reads it.
   *
   * @see errorDigest
   */
  error: unknown;
};

/**
 * The last-resort boundary, for a failure in the root layout itself, which `error.tsx` can't catch. It replaces the
 * whole document — hence its own `<html>` and `<body>`, and no `SiteShell`, which might be what failed.
 *
 * Reporting here is the only signal such a failure has. As in `error.tsx`, the error is reported, never rendered (see
 * `src/lib/observability/redact.ts`). Minimal styling that depends on nothing that could have broken.
 *
 * @param props - {@link GlobalErrorProps}.
 * @returns A complete, self-contained HTML document.
 */
export default function GlobalError({ error }: GlobalErrorProps): JSX.Element {
  useEffect((): void => {
    // See error.tsx for why both. The `boundary` attribute is what separates the two in a query — reaching this one
    // means the root layout itself failed, which is a categorically worse fact than a failed segment.
    logError("Global error boundary caught a root-layout failure", {
      attributes: { event: "error-boundary.caught", boundary: "global", digest: errorDigest(error) },
      cause: error,
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="error-page">
          <p className="eyebrow">Something Went Wrong</p>
          <h1>Civic Ledger Could Not Start.</h1>
          <p>This is a fault on our side, and it has been reported. Reloading the page usually clears it.</p>
          <a href="/" className="button button--primary">
            Return to the Overview
          </a>
        </main>
      </body>
    </html>
  );
}
