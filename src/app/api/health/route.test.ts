/**
 * Covers the `/api/health` route handler.
 *
 * Small, but it is the endpoint a platform's health check watches, so the two properties worth holding are that it
 * answers with a fixed, parseable shape and that answering costs nothing upstream. The second is the easier one to
 * erode: folding a Congress.gov ping in here would look like a more honest health check while actually making this
 * app's liveness depend on a third party's, and turning every probe into traffic against the API's rate limit.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

type HealthBody = { status: string; service: string; records: string; timestamp: string };

async function get(): Promise<{ status: number; body: HealthBody }> {
  const response = GET();
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

  /**
   * The field exists so that "up and publishing labeled fiction" is distinguishable from "up", which is otherwise a
   * state with no signal attached to it — no error, no non-200, no exception, and a green uptime check.
   */
  describe("the record set in use", (): void => {
    const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

    afterEach((): void => {
      if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
      else process.env.CONGRESS_API_KEY = originalApiKey;
    });

    it("reads live when a key is configured", async (): Promise<void> => {
      process.env.CONGRESS_API_KEY = "test-key";

      expect((await get()).body.records).toBe("live");
    });

    it("reads preview when no key is configured", async (): Promise<void> => {
      delete process.env.CONGRESS_API_KEY;

      expect((await get()).body.records).toBe("preview");
    });

    it("reads preview for a blank key, matching what the adapter itself does with one", async (): Promise<void> => {
      // A key set to whitespace is the easy outcome of copying `.env.example`, and `getCongressApiKey` already treats
      // it as absent. A health check that called it `live` would report the app as healthy in precisely the
      // misconfiguration this field exists to catch.
      process.env.CONGRESS_API_KEY = "   ";

      expect((await get()).body.records).toBe("preview");
    });
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
});
