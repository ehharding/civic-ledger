/**
 * Covers the no-op SDK the static demo builds against.
 *
 * There is no behavior to test — that is the point of the file. What is worth pinning is its *shape*: the stub is
 * substituted for `@sentry/nextjs` by a Turbopack alias, so any SDK function this app calls and this file does not
 * export becomes a failure in the static-export build. Naming each one here, beside the file that imports it, means
 * removing an export deliberately involves editing a test that says why it existed rather than deleting a line nobody
 * recognized.
 */
import { describe, expect, it } from "vitest";

import {
  captureException,
  captureRequestError,
  captureRouterTransitionStart,
  init,
  logger,
} from "@/lib/observability/sentry-stub";

describe("sentry-stub", (): void => {
  // Each is called the way the real SDK is called, which proves the substitution cannot throw inside a demo build's
  // error path — the one place a stub failing would be hardest to notice.
  it("stands in for Sentry.init, which instrumentation-client.ts calls", (): void => {
    expect(init()).toBeUndefined();
  });

  it("stands in for Sentry.captureException, which both error boundaries call", (): void => {
    expect(captureException()).toBeUndefined();
  });

  it("stands in for Sentry.captureRequestError, which instrumentation.ts re-exports", (): void => {
    expect(captureRequestError()).toBeUndefined();
  });

  it("stands in for Sentry.captureRouterTransitionStart, which instrumentation-client.ts re-exports", (): void => {
    expect(captureRouterTransitionStart()).toBeUndefined();
  });

  it("stands in for Sentry.logger, which log.ts calls on every warning and error", (): void => {
    // Reached by name rather than destructured, because `log.ts` indexes into it (`Sentry.logger[level]`) — so the
    // shape being stubbed is an object with these two keys, not two loose functions.
    expect(logger.warn()).toBeUndefined();
    expect(logger.error()).toBeUndefined();
  });

  it("stubs only the two log levels this app emits, so a third becomes a build failure rather than a silence", (): void => {
    // The whole reason this file is a hand-written list instead of a proxy. A demo build calling `logger.info` should
    // break the static-export job on CI, where someone reads the output — not no-op in a deployed page, where nobody
    // does. @see the module comment.
    expect(Object.keys(logger).toSorted()).toEqual(["error", "warn"]);
  });
});
