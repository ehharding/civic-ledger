/**
 * Covers the `/api/bills` route handler: that it passes the right arguments to the (mocked) adapter, and that it never
 * answers with an error status — "no more bills" and "couldn't load more" are both an empty page to the "Load More"
 * button.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/bills/route";
import type { BillPageResponse } from "@/lib/api-contract";
import { MAX_BILL_OFFSET } from "@/lib/api-query";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";
import { EDGE_CACHE_CONTROL, NO_STORE_CACHE_CONTROL } from "@/lib/edge-cache";
import { type RouteReply, readRouteReply } from "@/test/api-route";

const { getMoreBills } = vi.hoisted(() => ({ getMoreBills: vi.fn() }));

vi.mock("@/lib/congress/client", () => ({ getMoreBills }));

/** Calls the handler with a query string, the way a request from the directory would arrive. */
async function get(search: string): Promise<RouteReply<BillPageResponse>> {
  return readRouteReply<BillPageResponse>(await GET(new Request(`https://civic-ledger.test/api/bills${search}`)));
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

  it("lets the CDN share a page of bills between readers", async (): Promise<void> => {
    getMoreBills.mockResolvedValue([firstPreviewBill]);

    const response = await GET(new Request("https://civic-ledger.test/api/bills?offset=12"));

    expect(response.headers.get("Cache-Control")).toBe(EDGE_CACHE_CONTROL);
  });

  it("keeps an empty page out of the CDN, since it may be a failure rather than the end of the list", async (): Promise<void> => {
    const response = await GET(new Request("https://civic-ledger.test/api/bills?offset=9000"));

    expect(response.headers.get("Cache-Control")).toBe(NO_STORE_CACHE_CONTROL);
  });
});
