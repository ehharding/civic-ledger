/**
 * Covers the bill adapter's degraded and edge paths.
 *
 * `client.test.ts` covers the shapes a healthy request produces — preview fallback, live mapping, 404 versus outage.
 * What is left, and what this file is for, are the paths that only appear when something is wrong at the *same time*
 * as something else: a route param that can't be normalized while a key is configured, an upstream 200 whose body
 * carries no record, a single Congress dropping out of a search sweep while the rest succeed.
 *
 * These matter more than their rarity suggests, because they are where the adapter's two invariants — nothing throws,
 * and provenance travels with the data — are easiest to break without any test noticing. A page that renders a bill
 * while labeling it `live` after the live lookup failed is a worse bug than a page that fails to render at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BillLookupResult,
  type BillSearchResult,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/client";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { BillRouteParams, LegislativeBill } from "@/lib/congress/types";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Route params that pass this app's own shape guard nowhere: an unknown type code, a non-numeric congress, and a bill
 * number that isn't digits. Each must be rejected before it can be interpolated into an outbound URL.
 */
const MALFORMED_ROUTES: readonly BillRouteParams[] = [
  { congress: "119", type: "notatype", number: "284" },
  { congress: "not-a-congress", type: "hr", number: "284" },
  { congress: "119", type: "hr", number: "../secrets" },
];

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("getBillById", (): void => {
  it("rejects a malformed route without ever issuing a request", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const route of MALFORMED_ROUTES) {
      const result: BillLookupResult = await getBillById(route);

      expect(result.bill, JSON.stringify(route)).toBeUndefined();
      // "live" rather than "preview": the app *had* a key and could have looked this up. What it refused was the URL.
      expect(result.source, JSON.stringify(route)).toBe("live");
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 200 carrying no bill as no such record", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "284" });

    expect(result.bill).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("treats a 200 carrying an unmappable bill as no such record", async (): Promise<void> => {
    // Present in the payload but missing a title, so `mapCongressBill` returns null. Rendering a card with a blank
    // heading would be worse than a 404.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ bill: { congress: 119, type: "hr", number: 284 } })),
    );

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "284" });

    expect(result.bill).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("falls back through the snapshot to the preview fixtures when the lookup fails outright", async (): Promise<void> => {
    // Both the direct lookup and the snapshot request fail, so the only thing left is the labeled fixture set — and
    // the result must say `preview`, because that is what it is.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "284" });

    expect(result.source).toBe("preview");
    expect(result.bill?.number).toBe("284");
  });

  it("reports nothing found when a transient failure leaves no fixture to fall back to either", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "424242" });

    expect(result.bill).toBeUndefined();
    expect(result.source).toBe("preview");
  });
});

describe("getMoreBills", (): void => {
  it("returns an empty page when the request fails, so the UI simply stops offering more", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    expect(await getMoreBills(20)).toEqual([]);
  });
});

describe("bill sub-resources", (): void => {
  it("refuse a malformed route without issuing a request", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const route of MALFORMED_ROUTES) {
      expect(await getBillSummaries(route), JSON.stringify(route)).toEqual([]);
      expect(await getBillTextVersions(route), JSON.stringify(route)).toEqual([]);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getSearchResults", (): void => {
  /** Stubs the sweep: `bills` for the current Congress, and whatever `others` says for every other request. */
  function stubSweep(bills: unknown[], others: () => Promise<Response>): void {
    const currentCongress: number = getCurrentCongress();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: unknown): Promise<Response> => {
        const url: URL = new URL(String(input));
        if (url.pathname === `/v3/bill/${currentCongress}`) return Promise.resolve(jsonResponse({ bills }));
        return others();
      }),
    );
  }

  it("returns what the surviving Congresses found when one of them drops out", async (): Promise<void> => {
    // A single stalled or failing Congress must not hold the whole sweep hostage — it simply contributes nothing.
    vi.spyOn(console, "error").mockImplementation((): void => {});
    stubSweep(
      [
        {
          congress: getCurrentCongress(),
          type: "hr",
          number: "20",
          title: "Broadband Access Act",
          originChamber: "House",
          latestAction: { actionDate: "2026-06-01", text: "Introduced in House." },
        },
      ],
      (): Promise<Response> => Promise.reject(new Error("upstream unavailable")),
    );

    const result: BillSearchResult = await getSearchResults("broadband");

    expect(result.source).toBe("live");
    expect(result.bills.map((bill: LegislativeBill): string => bill.title)).toEqual(["Broadband Access Act"]);
  });

  it("orders undated matches after dated ones rather than dropping them", async (): Promise<void> => {
    stubSweep(
      [
        {
          congress: getCurrentCongress(),
          type: "hr",
          number: "10",
          title: "Undated Broadband Act",
          originChamber: "House",
          latestAction: { text: "Introduced in House." },
        },
        {
          congress: getCurrentCongress(),
          type: "hr",
          number: "30",
          title: "Second Undated Broadband Act",
          originChamber: "House",
          latestAction: { text: "Introduced in House." },
        },
        {
          congress: getCurrentCongress(),
          type: "hr",
          number: "20",
          title: "Dated Broadband Act",
          originChamber: "House",
          latestAction: { actionDate: "2026-06-01", text: "Introduced in House." },
        },
      ],
      (): Promise<Response> => Promise.resolve(jsonResponse({ bills: [] })),
    );

    const result: BillSearchResult = await getSearchResults("broadband");

    expect(result.bills[0]?.title).toBe("Dated Broadband Act");
    expect(result.bills).toHaveLength(3);
  });

  it("pins a citation hit ahead of a sweep match that also mentions it", async (): Promise<void> => {
    // The comparator's pinned branch only runs when the pinned bill has something to be compared *against* — a sweep
    // that returned nothing else would never exercise it.
    const currentCongress: number = getCurrentCongress();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: unknown): Promise<Response> => {
        const url: URL = new URL(String(input));

        if (url.pathname === `/v3/bill/${currentCongress}/hr/284`) {
          return Promise.resolve(
            jsonResponse({
              bill: {
                congress: currentCongress,
                type: "HR",
                number: "284",
                title: "Community Water Reliability Act",
                originChamber: "House",
                // Deliberately older than the sweep match: the pin has to beat the date ordering, not ride on it.
                latestAction: { actionDate: "2020-01-01", text: "Introduced in House." },
              },
            }),
          );
        }

        if (url.pathname === `/v3/bill/${currentCongress}`) {
          return Promise.resolve(
            jsonResponse({
              bills: [
                {
                  congress: currentCongress,
                  type: "hr",
                  number: "999",
                  title: "A Bill Amending HR 284",
                  originChamber: "House",
                  latestAction: { actionDate: "2026-06-01", text: "Introduced in House." },
                },
              ],
            }),
          );
        }

        return Promise.resolve(jsonResponse({ bills: [] }));
      }),
    );

    const result: BillSearchResult = await getSearchResults("HR 284");

    expect(result.bills[0]?.number).toBe("284");
    expect(result.bills[1]?.number).toBe("999");
  });

  it("keeps the pin first no matter which side of a comparison it lands on", async (): Promise<void> => {
    // The comparator's pinned check has two outcomes, and which one a sort reaches depends on the order the engine
    // happens to compare in. Several sweep matches, all newer than the pin, forces both.
    const currentCongress: number = getCurrentCongress();
    const sweep = Array.from({ length: 5 }, (_unused: unknown, index: number) => ({
      congress: currentCongress,
      type: "hr",
      number: String(900 + index),
      title: `A Bill Amending HR 284, Part ${index}`,
      originChamber: "House",
      latestAction: { actionDate: `2026-0${index + 1}-01`, text: "Introduced in House." },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: unknown): Promise<Response> => {
        const url: URL = new URL(String(input));
        if (url.pathname === `/v3/bill/${currentCongress}/hr/284`) {
          return Promise.resolve(
            jsonResponse({
              bill: {
                congress: currentCongress,
                type: "HR",
                number: "284",
                title: "Community Water Reliability Act",
                originChamber: "House",
                latestAction: { actionDate: "2019-01-01", text: "Introduced in House." },
              },
            }),
          );
        }
        if (url.pathname === `/v3/bill/${currentCongress}`) return Promise.resolve(jsonResponse({ bills: sweep }));
        return Promise.resolve(jsonResponse({ bills: [] }));
      }),
    );

    const result: BillSearchResult = await getSearchResults("HR 284");

    expect(result.bills[0]?.number).toBe("284");
    expect(result.bills).toHaveLength(6);
  });

  it("lists a citation hit once, even when the sweep returned it too", async (): Promise<void> => {
    const currentCongress: number = getCurrentCongress();
    const record = {
      congress: currentCongress,
      type: "HR",
      number: "284",
      title: "Community Water Reliability Act",
      originChamber: "House",
      latestAction: { actionDate: "2026-01-01", text: "Introduced in House." },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: unknown): Promise<Response> => {
        const url: URL = new URL(String(input));
        if (url.pathname === `/v3/bill/${currentCongress}/hr/284`)
          return Promise.resolve(jsonResponse({ bill: record }));
        if (url.pathname === `/v3/bill/${currentCongress}`) return Promise.resolve(jsonResponse({ bills: [record] }));
        return Promise.resolve(jsonResponse({ bills: [] }));
      }),
    );

    const result: BillSearchResult = await getSearchResults("HR 284");

    expect(result.bills.filter((bill: LegislativeBill): boolean => bill.number === "284")).toHaveLength(1);
  });
});
