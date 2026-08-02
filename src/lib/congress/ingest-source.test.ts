/**
 * Covers the windowed sweep the scheduled sync reads through.
 *
 * Three things here are easy to get subtly wrong and expensive to notice later: the request must not be served from the
 * data cache (a sync reading a five-minute-old page would faithfully record that nothing changed), the sweep must page
 * ascending (descending shifts every offset when a record updates mid-sweep), and an incomplete window must say so
 * rather than letting the watermark advance over records nobody read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchBillsUpdatedSince,
  MAX_INGEST_PAGES,
  parseSourceTimestamp,
  toApiDateTime,
  type UpdatedBillSweep,
} from "@/lib/congress/ingest-source";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

/** One raw list-endpoint bill record. */
function apiBill(index: number, updateDate?: string): Record<string, unknown> {
  return {
    congress: 119,
    type: "HR",
    number: String(1000 + index),
    title: `A bill numbered ${1000 + index}`,
    originChamber: "House",
    introducedDate: "2026-01-14",
    latestAction: { actionDate: "2026-03-02", text: "Referred to committee." },
    ...(updateDate ? { updateDate } : {}),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A page of exactly `count` records, which is what the sweep reads as "there may be more". */
function fullPage(count: number): Response {
  return jsonResponse({ bills: Array.from({ length: count }, (_unused: unknown, i: number): unknown => apiBill(i)) });
}

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("toApiDateTime", (): void => {
  /* Congress.gov's `fromDateTime` takes whole seconds and rejects the fractional part `toISOString` emits. */
  it("formats to whole seconds in UTC", (): void => {
    expect(toApiDateTime(new Date("2026-07-14T09:30:00.482Z"))).toBe("2026-07-14T09:30:00Z");
  });
});

describe("parseSourceTimestamp", (): void => {
  it("parses an upstream timestamp", (): void => {
    expect(parseSourceTimestamp("2026-07-14T09:30:00Z")).toEqual(new Date("2026-07-14T09:30:00Z"));
  });

  /* Stored as a genuine "no upstream timestamp" rather than silently becoming the time this app read the record — which
     would be this app's own fact wearing Congress.gov's name. */
  it("reports null for an absent or unparseable value", (): void => {
    expect(parseSourceTimestamp(undefined)).toBeNull();
    expect(parseSourceTimestamp("")).toBeNull();
    expect(parseSourceTimestamp("sometime last spring")).toBeNull();
  });
});

describe("fetchBillsUpdatedSince", (): void => {
  it("maps records into the app's model and carries their upstream timestamps", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse({ bills: [apiBill(0, "2026-07-14T09:30:00Z")] })),
    );

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 500,
    });

    expect(sweep.complete).toBe(true);
    expect(sweep.requests).toBe(1);
    expect(sweep.bills[0]?.bill.number).toBe("1000");
    expect(sweep.bills[0]?.sourceUpdatedAt).toEqual(new Date("2026-07-14T09:30:00Z"));
  });

  /* A sync's whole purpose is to see what changed since it last looked. Served a cached page, it would faithfully
     record that nothing had. */
  it("bypasses the data cache", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchBillsUpdatedSince({ apiKey: "test-key", congress: 119, since: null, maxRecords: 500 });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { next?: unknown };
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  /* Descending order inserts a mid-sweep update at the front, shifting every later offset by one and skipping whatever
     falls across the boundary. Ascending puts new activity after the window being read. */
  it("pages ascending by update date", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchBillsUpdatedSince({ apiKey: "test-key", congress: 119, since: null, maxRecords: 500 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sort=updateDate%2Basc");
  });

  it("asks for no window on a first run", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchBillsUpdatedSince({ apiKey: "test-key", congress: 119, since: null, maxRecords: 500 });

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("fromDateTime");
  });

  /* The overlap is what stops a record published just after the previous run read its page from being stepped over
     forever. It costs a handful of no-op upserts, which the payload hash turns into no writes at all. */
  it("reaches five minutes back beyond the stored watermark", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: new Date("2026-07-14T09:30:00Z"),
      maxRecords: 500,
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("fromDateTime")).toBe("2026-07-14T09:25:00Z");
  });

  it("keeps paging while pages come back full, and stops on a short one", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fullPage(250))
      .mockResolvedValueOnce(jsonResponse({ bills: [apiBill(0)] }));
    vi.stubGlobal("fetch", fetchMock);

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 5_000,
    });

    expect(sweep.requests).toBe(2);
    expect(sweep.bills).toHaveLength(251);
    expect(sweep.complete).toBe(true);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("offset=250");
  });

  /* What was read is real and is written; the run simply doesn't claim to have seen the whole window. */
  it("reports an incomplete sweep when the per-run cap is reached", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => fullPage(250)),
    );

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 100,
    });

    expect(sweep.bills).toHaveLength(250);
    expect(sweep.complete).toBe(false);
    expect(sweep.requests).toBe(1);
  });

  it("reports an incomplete sweep when a page fails, keeping what already arrived", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(fullPage(250)).mockResolvedValueOnce(jsonResponse({}, 503));
    vi.stubGlobal("fetch", fetchMock);

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 5_000,
    });

    expect(sweep.bills).toHaveLength(250);
    expect(sweep.complete).toBe(false);
    expect(sweep.requests).toBe(2);
  });

  /* The guard that keeps a distant cursor from turning one sync into a full mirror of a Congress. */
  it("stops at the per-run page ceiling", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => fullPage(250)),
    );

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: Number.MAX_SAFE_INTEGER,
    });

    expect(sweep.requests).toBe(MAX_INGEST_PAGES);
    expect(sweep.complete).toBe(false);
  });

  /* A 200 with no `bills` key is a real upstream shape — it is what an empty window looks like — and it must read as
     "nothing changed", not as a failure. */
  it("treats a payload carrying no records as an empty, complete window", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse({})),
    );

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 500,
    });

    expect(sweep).toEqual({ bills: [], requests: 1, complete: true });
  });

  it("drops a record too incomplete to map, rather than storing a broken one", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse({ bills: [apiBill(0), { congress: 119, type: "HR" }] })),
    );

    const sweep: UpdatedBillSweep = await fetchBillsUpdatedSince({
      apiKey: "test-key",
      congress: 119,
      since: null,
      maxRecords: 500,
    });

    expect(sweep.bills).toHaveLength(1);
  });
});
