/**
 * Holds the CDN window to the app's one shared cache window, so changing `REVALIDATE_SECONDS` moves the API routes with
 * the pages rather than leaving them on the old value. @see src/app/revalidate.test.ts for the same rule, applied to
 * the route segments.
 */
import { describe, expect, it } from "vitest";

import { REVALIDATE_SECONDS } from "@/lib/congress/upstream/http";
import { EDGE_CACHE_CONTROL, EDGE_STALE_SECONDS } from "@/lib/edge-cache";

describe("EDGE_CACHE_CONTROL", (): void => {
  it("caches at the CDN for the shared five-minute window, and never in the reader's browser", (): void => {
    expect(EDGE_CACHE_CONTROL).toContain(`s-maxage=${REVALIDATE_SECONDS}`);
    expect(EDGE_CACHE_CONTROL).toContain("max-age=0");
  });

  it("serves a stale copy while the CDN refreshes it, rather than making the reader wait", (): void => {
    expect(EDGE_CACHE_CONTROL).toContain(`stale-while-revalidate=${EDGE_STALE_SECONDS}`);
  });

  it("is public, since these responses carry public records and read nothing per-reader", (): void => {
    expect(EDGE_CACHE_CONTROL.startsWith("public,")).toBe(true);
  });
});
