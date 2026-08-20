/**
 * Covers the `/api/bills/search` route handler.
 *
 * Same shape of contract as `/api/bills`, and the same reason for pinning it: this route never answers with an error
 * status, because `useBillSearch` treats any non-OK response as "the route isn't reachable" and silently drops to the
 * narrower client-side fallback. A handler that started returning a 400 for a long or empty query would not surface an
 * error anywhere — it would just make every such search quietly worse, and label it `degraded` while doing so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/bills/search/route";
import type { BillSearchResponse } from "@/lib/api-contract";
import { MAX_QUERY_LENGTH } from "@/lib/api-query";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";

const { getSearchResults } = vi.hoisted(() => ({ getSearchResults: vi.fn() }));

vi.mock("@/lib/congress/client", () => ({ getSearchResults }));

const EMPTY_RESULT: BillSearchResponse = {
  bills: [],
  source: "live",
  congressesSearched: 27,
  truncated: false,
};

/** Calls the handler with a raw query string, exactly as the browser would send it. */
async function get(search: string): Promise<{ status: number; body: BillSearchResponse }> {
  const response = await GET(new Request(`https://civic-ledger.test/api/bills/search${search}`));
  return { status: response.status, body: (await response.json()) as BillSearchResponse };
}

beforeEach((): void => {
  getSearchResults.mockReset().mockResolvedValue(EMPTY_RESULT);
});

describe("GET /api/bills/search", (): void => {
  it("returns the sweep's matches along with the scope it covered", async (): Promise<void> => {
    getSearchResults.mockResolvedValue({
      bills: [firstPreviewBill],
      source: "live",
      congressesSearched: 27,
      truncated: true,
    } satisfies BillSearchResponse);

    const { status, body } = await get("?q=broadband");

    expect(status).toBe(200);
    expect(body.bills).toEqual([firstPreviewBill]);
    // The UI describes the scope of what it just searched, so these have to survive the round trip intact.
    expect(body.congressesSearched).toBe(27);
    expect(body.truncated).toBe(true);
  });

  it("passes the query through to the adapter", async (): Promise<void> => {
    await get(`?q=${encodeURIComponent("clean air & water")}`);

    expect(getSearchResults).toHaveBeenCalledExactlyOnceWith("clean air & water");
  });

  it("trims surrounding whitespace", async (): Promise<void> => {
    await get(`?q=${encodeURIComponent("  broadband  ")}`);

    expect(getSearchResults).toHaveBeenCalledExactlyOnceWith("broadband");
  });

  it("caps an overlong query rather than refusing it", async (): Promise<void> => {
    await get(`?q=${"a".repeat(MAX_QUERY_LENGTH + 500)}`);

    expect(getSearchResults).toHaveBeenCalledExactlyOnceWith("a".repeat(MAX_QUERY_LENGTH));
  });

  it("stays well-defined for a missing query", async (): Promise<void> => {
    // The client doesn't normally call this with a blank query, but `matchesQuery` treats an empty query as matching
    // everything, so the route has an answer rather than an edge case.
    const { status } = await get("");

    expect(status).toBe(200);
    expect(getSearchResults).toHaveBeenCalledExactlyOnceWith("");
  });

  it("answers a search that found nothing with a 200 and an empty list", async (): Promise<void> => {
    const { status, body } = await get("?q=nothing-matches-this");

    expect(status).toBe(200);
    expect(body.bills).toEqual([]);
  });

  it("reports preview provenance rather than hiding it", async (): Promise<void> => {
    // A search that can't reach live data returns the labeled preview matches, and `source` is how the UI knows to say
    // so. Dropping it here would let fictional records render as though they were the real record.
    getSearchResults.mockResolvedValue({ ...EMPTY_RESULT, source: "preview" } satisfies BillSearchResponse);

    const { body } = await get("?q=broadband");

    expect(body.source).toBe("preview");
  });
});
