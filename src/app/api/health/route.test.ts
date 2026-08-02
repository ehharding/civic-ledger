/**
 * Covers the `/api/health` route handler.
 *
 * Small, but it is the endpoint a platform's health check watches, so the two properties worth holding are that it
 * answers with a fixed, parseable shape and that answering costs nothing upstream. The second is the easier one to
 * erode: folding a Congress.gov ping in here would look like a more honest health check while actually making this
 * app's liveness depend on a third party's, and turning every probe into traffic against the API's rate limit.
 */
import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

type HealthBody = { status: string; service: string; timestamp: string; ingestion: unknown };

async function get(): Promise<{ status: number; body: HealthBody }> {
  const response = await GET();
  return { status: response.status, body: (await response.json()) as HealthBody };
}

describe("GET /api/health", (): void => {
  it("reports the service as up", async (): Promise<void> => {
    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("civic-ledger");
  });

  it("stamps the response so a cached or stale reply is recognizable as one", async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));

    try {
      const { body } = await get();
      expect(body.timestamp).toBe("2026-07-31T12:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes no upstream request", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      await get();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /* Freshness is reported, not required. With no DATABASE_URL there is nothing to report and the probe still answers
     "ok" — the whole point of reading it through a helper that swallows failure. */
  it("reports null ingestion freshness when no database is configured, and stays healthy", async (): Promise<void> => {
    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.ingestion).toBeNull();
  });
});
