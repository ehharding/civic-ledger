/**
 * Covers when a cached route refuses a degraded render: only on a production server, outside the build, with a key
 * configured, for a cached route rather than an on-demand twin. Every other combination must render as before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveDataUnavailableError, refuseDegradedRender } from "@/lib/congress/live-render";

/** Puts the process where a refusal applies: a production server, a key configured, past the build. */
function stubProductionServer(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CONGRESS_API_KEY", "test-key");
  vi.stubEnv("NEXT_PHASE", "phase-production-server");
}

afterEach((): void => {
  vi.unstubAllEnvs();
});

describe("refuseDegradedRender", (): void => {
  it("throws on a production server when a cached route's read failed", (): void => {
    stubProductionServer();

    expect((): void => refuseDegradedRender(true, "/bills")).toThrow(LiveDataUnavailableError);
  });

  it("names the route, never a query, in the error", (): void => {
    stubProductionServer();

    expect((): void => refuseDegradedRender(true, "/bills/[congress]/[type]/[number]")).toThrow(
      /\/bills\/\[congress\]\/\[type\]\/\[number\]/,
    );
  });

  it("lets a healthy render through", (): void => {
    stubProductionServer();

    expect((): void => refuseDegradedRender(false, "/bills")).not.toThrow();
  });

  it("lets an on-demand twin degrade, since its render is never cached", (): void => {
    stubProductionServer();

    expect((): void => refuseDegradedRender(true, undefined)).not.toThrow();
  });

  it("lets preview data through when no key is configured, since that is the intended output", (): void => {
    stubProductionServer();
    vi.stubEnv("CONGRESS_API_KEY", "");

    expect((): void => refuseDegradedRender(true, "/bills")).not.toThrow();
  });

  it("never fails `next build`, so a rate-limited API can't block a deploy", (): void => {
    stubProductionServer();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect((): void => refuseDegradedRender(true, "/bills")).not.toThrow();
  });

  it("leaves dev and tests alone, which have no ISR cache to protect", (): void => {
    stubProductionServer();
    vi.stubEnv("NODE_ENV", "development");

    expect((): void => refuseDegradedRender(true, "/bills")).not.toThrow();
  });
});
