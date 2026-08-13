"use client";

import * as Sentry from "@sentry/nextjs";
import type { JSX } from "react";
import { useEffect } from "react";

import "./globals.css";

/**
 * The last-resort boundary, for a failure in the root layout itself.
 *
 * `error.tsx` handles everything inside the layout, which is nearly every failure this app can have. It cannot handle a
 * throw in the root layout, because it renders *inside* the thing that just failed. Next.js's answer is this file: it
 * replaces the entire document, which is why it carries its own `<html>` and `<body>` and why it is the one component
 * here that cannot use `SiteShell` — the shell is a plausible source of the error it is reporting.
 *
 * Reaching this page at all means something structural broke, and that is precisely the failure least likely to be
 * noticed without a report: there is no error boundary left above it and, in production, no console anyone is watching.
 * So capturing here is not belt-and-braces — it is the only signal this failure has.
 *
 * The same rule as `error.tsx` holds and matters more, not less: the error is reported, never rendered. Nothing about
 * the failure reaches the DOM, because a root-layout failure is exactly where a half-initialized value carrying an
 * upstream URL is most likely to be the thing that threw. `src/lib/observability/redact.ts` decides what the report
 * itself may carry.
 *
 * Styling is deliberately minimal and inherits the app's own stylesheet, so this reads as the same product rather than
 * as a browser error page — but it depends on nothing that could have been what broke.
 *
 * @param error - The caught error, including Next's `digest`.
 * @returns A complete, self-contained HTML document.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }): JSX.Element {
  useEffect((): void => {
    console.error("[global-error-boundary]", error);
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
