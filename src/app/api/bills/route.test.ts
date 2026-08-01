/**
 * Covers the `/api/bills` route handler.
 *
 * The handler itself is thin, and deliberately so — the parsing lives in `api-query.ts` and the fetching in the
 * adapter. What is worth pinning here is the seam between them, and the one promise this route makes that neither of
 * its collaborators can make alone: it never answers with an error status. "No more bills" and "couldn't load more"
 * arrive at the client as the same empty page, which is exactly how the "Load More" button behaves in both cases, and a
 * well-meaning change to return a 400 or a 502 would break that quietly — the button would simply stop working rather
 * than fail visibly.
 *
 * The adapter is mocked rather than exercised: it is server-only, reads `CONGRESS_API_KEY`, and already has its own
 * suite in `client.test.ts`. What this file asserts is that the route hands it the right arguments.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/bills/route";
import { MAX_BILL_OFFSET } from "@/lib/api-query";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { firstPreviewBill } from "@/lib/congress/fixtures";
import type { LegislativeBill } from "@/lib/congress/types";

const { getMoreBills } = vi.hoisted(() => ({ getMoreBills: vi.fn() }));

vi.mock("@/lib/congress/client", () => ({ getMoreBills }));

/** Calls the handler with a query string, the way a request from the directory would arrive. */
async function get(search: string): Promise<{ status: number; body: { bills: LegislativeBill[] } }> {
  const response = await GET(new Request(`https://civic-ledger.test/api/bills${search}`));
  return { status: response.status, body: (await response.json()) as { bills: LegislativeBill[] } };
}

beforeEach((): void => {
  getMoreBills.mockReset().mockResolvedValue([]);
});

describe("GET /api/bills", (): void => {
  it("returns the next page of bills", async (): Promise<void> => {
    getMoreBills.mockResolvedValue([firstPreviewBill]);

    const { status, body } = await get("?offset=12");

    expect(status).toBe(200);
    expect(body.bills).toEqual([firstPreviewBill]);
  });

  it("passes the parsed offset and Congress through to the adapter", async (): Promise<void> => {
    await get("?offset=24&congress=118");

    expect(getMoreBills).toHaveBeenCalledExactlyOnceWith(24, 118);
  });

  it("defaults to the first page of the current Congress when neither param is present", async (): Promise<void> => {
    await get("");

    expect(getMoreBills).toHaveBeenCalledExactlyOnceWith(0, getCurrentCongress());
  });

  it("resolves malformed params instead of rejecting the request", async (): Promise<void> => {
    const { status } = await get("?offset=not-a-number&congress=banana");

    expect(status).toBe(200);
    expect(getMoreBills).toHaveBeenCalledExactlyOnceWith(0, getCurrentCongress());
  });

  it("clamps an offset that would otherwise become an expensive upstream request", async (): Promise<void> => {
    await get("?offset=999999999");

    expect(getMoreBills).toHaveBeenCalledExactlyOnceWith(MAX_BILL_OFFSET, getCurrentCongress());
  });

  it("falls back to the current Congress for one outside the supported range", async (): Promise<void> => {
    await get("?congress=1");

    expect(getMoreBills).toHaveBeenCalledExactlyOnceWith(0, getCurrentCongress());
  });

  it("answers an exhausted or unavailable listing with an empty page, not an error", async (): Promise<void> => {
    getMoreBills.mockResolvedValue([]);

    const { status, body } = await get("?offset=9000");

    expect(status).toBe(200);
    expect(body).toEqual({ bills: [] });
  });
});
