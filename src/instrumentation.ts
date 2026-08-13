import * as Sentry from "@sentry/nextjs";

/**
 * Next.js's server startup hook, and this app's only server-side Sentry entry point.
 *
 * Next calls `register()` once per server runtime before any request is handled, which is the only moment early enough
 * for the SDK's instrumentation to wrap `fetch` and the React server renderer. The two runtime configs are imported
 * dynamically rather than at the top of this file because each pulls in a bundle the other runtime cannot load — an
 * unconditional import of the Node SDK is a build failure on the edge, not a wasted byte.
 *
 * @see sentry.server.config.ts, sentry.edge.config.ts
 */
export async function register(): Promise<void> {
  // The static GitHub Pages demo has no server at request time and must never carry a DSN, but `register()` still runs
  // once at build time. Returning early keeps that build from initializing an SDK whose only possible report would be
  // about the build machine. @see the "Secondary: GitHub Pages Static Demo" section of docs/deployment.md.
  if (process.env.STATIC_EXPORT === "true") return;

  if (process.env.NEXT_RUNTIME === "nodejs") await import("@/sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("@/sentry.edge.config");
}

/**
 * Reports errors thrown while rendering a server component, a route handler, or a nested layout.
 *
 * This is the half of server-side reporting that `register()` does not cover. React catches a server render error and
 * hands it to the nearest error boundary, so by the time `error.tsx` runs in the browser the original stack is gone and
 * only Next's `digest` remains. This hook fires on the server, where the real one still exists — which is what makes a
 * captured event name a line in `bills/reads.ts` rather than "an error occurred, digest 1234567890".
 *
 * @see error.tsx and global-error.tsx, which report the client half of the same failure.
 */
export const onRequestError: typeof Sentry.captureRequestError = Sentry.captureRequestError;
