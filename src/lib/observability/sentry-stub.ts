/**
 * A no-op stand-in for `@sentry/nextjs` in the static demo, which has no DSN and so can't report anything; it saves
 * ~65 KB gzipped. Aliased in by `next.config.ts` under `STATIC_EXPORT`.
 *
 * Each export mirrors one the app imports, written out so a missing one fails the static-export build.
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

/** The levels of `Sentry.logger` that `log.ts` writes to, each a no-op here. */
type StubLogger = {
  /** Stands in for `Sentry.logger.warn`. */
  warn: () => undefined;
  /** Stands in for `Sentry.logger.error`. */
  error: () => undefined;
};

/**
 * Stands in for `Sentry.logger`, which `log.ts` indexes by level. A missing key wouldn't fail the build (`log.ts`
 * swallows the error), so `sentry-stub.test.ts` pins the key set.
 */
export const logger: StubLogger = {
  warn: (): undefined => undefined,
  error: (): undefined => undefined,
};
