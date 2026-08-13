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
});
