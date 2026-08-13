/**
 * A no-op stand-in for `@sentry/nextjs`, substituted for the real SDK in the static GitHub Pages demo only.
 *
 * That build structurally cannot report anything: it has no server at request time and never carries a DSN, so the SDK
 * it would otherwise ship initializes, finds no DSN, and does nothing — after costing the demo about 65 KB gzipped,
 * close to a third of its JavaScript. `docs/deployment.md` already records a 7 KB version of this trade as one worth
 * writing down; ten times that, for a preview whose whole purpose is to load quickly for someone glancing at it, goes
 * the other way.
 *
 * Wired in through Turbopack's `resolveAlias` in `next.config.ts`, under the same `STATIC_EXPORT` gate as everything
 * else that build changes. The primary Vercel deployment never sees this file.
 *
 * Every export here mirrors one this app actually imports from the SDK. A missing one is a build failure in the static
 * export job on CI rather than a silent runtime error in the demo — which is the right way round, and is why this is a
 * hand-written list rather than a proxy that answers to any name.
 *
 * @see instrumentation-client.ts, instrumentation.ts, error.tsx, global-error.tsx — the four importers.
 */

/** Stands in for `Sentry.init`. Accepts and discards the options `sentryInitOptions` built. */
export function init(): undefined {
  return undefined;
}

/** Stands in for `Sentry.captureException`, called by both error boundaries. */
export function captureException(): undefined {
  return undefined;
}

/** Stands in for `Sentry.captureRequestError`, re-exported as `onRequestError` from `instrumentation.ts`. */
export function captureRequestError(): undefined {
  return undefined;
}

/** Stands in for `Sentry.captureRouterTransitionStart`, re-exported from `instrumentation-client.ts`. */
export function captureRouterTransitionStart(): undefined {
  return undefined;
}
