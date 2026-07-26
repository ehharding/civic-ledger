/**
 * Covers client.ts's three main paths: the no-key preview fallback, mapping live API responses
 * (list- and detail-endpoint field-name variants both need coverage — see mapCongressBill), and the
 * distinction between "not found" (404) and "temporarily unavailable" (any other failure).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BillLookupResult,
  type BillSearchResult,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getCongressSnapshot,
  getCongressSnapshotForCongress,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/client";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { firstPreviewBill, previewBills } from "@/lib/congress/fixtures";
import type { BillSummary, BillTextVersion, CongressSnapshot, LegislativeBill } from "@/lib/congress/types";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach((): void => {
  vi.restoreAllMocks();
});

afterEach((): void => {
  if (originalApiKey === undefined) {
    delete process.env.CONGRESS_API_KEY;
  } else {
    process.env.CONGRESS_API_KEY = originalApiKey;
  }
});

describe("getCongressSnapshot", (): void => {
  it("returns labeled preview data scoped to the current Congress when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const snapshot: CongressSnapshot = await getCongressSnapshot();
    const currentCongressPreviewBills: LegislativeBill[] = previewBills.filter(
      (bill: LegislativeBill): boolean => bill.congress === getCurrentCongress(),
    );

    expect(snapshot.source).toBe("preview");
    expect(snapshot.bills).toEqual(currentCongressPreviewBills);
    expect(snapshot.notice).toMatch(/preview/i);
  });

  it("maps live list-endpoint bills using type/number field names", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          bills: [
            {
              congress: 119,
              type: "hr",
              number: 42,
              title: "A Live Bill",
              originChamber: "House",
              latestAction: { actionDate: "2026-07-01", text: "Referred to Committee." },
              policyArea: { name: "Health" },
              url: "https://api.congress.gov/v3/bill/119/hr/42",
            },
          ],
        }),
      ),
    );

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("live");
    expect(snapshot.bills).toHaveLength(1);
    expect(snapshot.bills[0]).toMatchObject({
      congress: 119,
      type: "HR",
      number: "42",
      title: "A Live Bill",
      stage: "committee",
    });
  });

  it("requests the bill list scoped to the current Congress, not the unfiltered list", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCongressSnapshot();

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(`/v3/bill/${getCurrentCongress()}`);
  });

  it("falls back to preview data when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("preview");
    expect(snapshot.notice).toMatch(/temporarily unavailable/i);
  });
});

describe("getCongressSnapshotForCongress", (): void => {
  it("filters preview bills to just the requested Congress, not every fixture", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const snapshot: CongressSnapshot = await getCongressSnapshotForCongress(118);

    expect(snapshot.source).toBe("preview");
    expect(snapshot.bills).toEqual(previewBills.filter((bill: LegislativeBill): boolean => bill.congress === 118));
    expect(snapshot.bills.every((bill: LegislativeBill): boolean => bill.congress === 118)).toBe(true);
  });

  it("reports an honest empty result for a Congress with no preview fixtures, instead of borrowing another Congress's bills", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const snapshot: CongressSnapshot = await getCongressSnapshotForCongress(100);

    expect(snapshot.source).toBe("preview");
    expect(snapshot.bills).toEqual([]);
    expect(snapshot.notice).toMatch(/100th Congress/);
  });

  it("requests the bill list scoped to the given Congress", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCongressSnapshotForCongress(110);

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/v3/bill/110");
  });
});

describe("getBillById", (): void => {
  it("finds a matching preview bill when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const result: BillLookupResult = await getBillById({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    expect(result.bill).toEqual(target);
    expect(result.source).toBe("preview");
  });

  it("includes a parsable retrievedAt timestamp alongside the result", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const result: BillLookupResult = await getBillById({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    expect(Number.isNaN(new Date(result.retrievedAt).valueOf())).toBe(false);
  });

  it("maps a live detail-endpoint bill using billType/billNumber field names", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          bill: {
            congress: 117,
            billType: "HR",
            billNumber: "3076",
            title: "Postal Service Reform Act of 2021",
            originChamber: "House",
            latestAction: { date: "2022-04-06", text: "Became Public Law No: 117-108." },
            policyArea: { name: "Government Operations and Politics" },
          },
        }),
      ),
    );

    const result: BillLookupResult = await getBillById({ congress: "117", type: "hr", number: "3076" });

    expect(result.source).toBe("live");
    expect(result.bill).toMatchObject({
      congress: 117,
      type: "HR",
      number: "3076",
      stage: "law",
    });
  });

  it("returns undefined for a real 404 instead of silently falling back", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "999999" });

    expect(result.bill).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("falls back to a snapshot search and reports that source when the direct lookup throws", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const target: LegislativeBill = firstPreviewBill;
    const result: BillLookupResult = await getBillById({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    // The direct lookup's fetch rejects, and so does the snapshot search's own fetch, so both fall back to preview.
    expect(result.bill).toEqual(target);
    expect(result.source).toBe("preview");
    expect(result.notice).toMatch(/temporarily unavailable/i);
  });
});

describe("getMoreBills", (): void => {
  it("returns an empty page when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const bills: LegislativeBill[] = await getMoreBills(12);

    expect(bills).toEqual([]);
  });

  it("requests the given offset and maps the returned page", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        bills: [
          {
            congress: 119,
            type: "S",
            number: "10",
            title: "Another Bill",
            latestAction: { actionDate: "2026-07-02", text: "Introduced in Senate." },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const bills: LegislativeBill[] = await getMoreBills(24);

    expect(bills).toHaveLength(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(`/v3/bill/${getCurrentCongress()}`);
    expect(requestedUrl.searchParams.get("offset")).toBe("24");
  });

  it("requests the given Congress when provided, instead of defaulting to the current one", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getMoreBills(0, 110);

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/v3/bill/110");
  });
});

describe("getBillSummaries", (): void => {
  it("returns a single labeled preview summary when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const summaries: BillSummary[] = await getBillSummaries({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.actionDesc).toBe("Preview Summary");
    expect(summaries[0]?.html).toContain("<p>");
  });

  it("returns an empty list in preview mode for a bill with no fixture summary", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const summaries: BillSummary[] = await getBillSummaries({ congress: "50", type: "hr", number: "1" });

    expect(summaries).toEqual([]);
  });

  it("maps and sanitizes live summaries, most recent first", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          summaries: [
            {
              versionCode: "00",
              actionDate: "2021-05-11",
              actionDesc: "Introduced in House",
              text: "<p>As introduced.</p>",
            },
            {
              versionCode: "49",
              actionDate: "2022-04-06",
              actionDesc: "Public Law",
              text: "<p>As enacted.</p><script>alert(1)</script>",
            },
          ],
        }),
      ),
    );

    const summaries: BillSummary[] = await getBillSummaries({ congress: "117", type: "hr", number: "3076" });

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ actionDesc: "Public Law", actionDate: "2022-04-06" });
    expect(summaries[0]?.html).toBe("<p>As enacted.</p>alert(1)");
    expect(summaries[1]).toMatchObject({ actionDesc: "Introduced in House", actionDate: "2021-05-11" });
  });

  it("returns an empty list on a 404", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const summaries: BillSummary[] = await getBillSummaries({ congress: "119", type: "hr", number: "999999" });

    expect(summaries).toEqual([]);
  });

  it("returns an empty list when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const summaries: BillSummary[] = await getBillSummaries({ congress: "117", type: "hr", number: "3076" });

    expect(summaries).toEqual([]);
  });
});

describe("getBillTextVersions", (): void => {
  it("returns an empty list when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const versions: BillTextVersion[] = await getBillTextVersions({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    // Deliberate: preview fixtures never fabricate links to specific documents that don't exist.
    expect(versions).toEqual([]);
  });

  it("maps live text versions most recent first and drops formats missing a url", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          textVersions: [
            {
              type: "Introduced in House",
              date: "2021-05-11T04:00:00Z",
              formats: [{ type: "Formatted Text", url: "https://www.congress.gov/117/bills/hr3076/BILLS-ih.htm" }],
            },
            {
              type: "Engrossed in House",
              date: "2021-09-27T04:00:00Z",
              formats: [
                { type: "Formatted Text", url: "https://www.congress.gov/117/bills/hr3076/BILLS-eh.htm" },
                { type: "PDF" },
              ],
            },
          ],
        }),
      ),
    );

    const versions: BillTextVersion[] = await getBillTextVersions({ congress: "117", type: "hr", number: "3076" });

    expect(versions).toHaveLength(2);
    expect(versions[0]?.type).toBe("Engrossed in House");
    expect(versions[0]?.formats).toHaveLength(1);
    expect(versions[1]?.type).toBe("Introduced in House");
  });

  it("returns an empty list on a 404", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const versions: BillTextVersion[] = await getBillTextVersions({ congress: "119", type: "hr", number: "999999" });

    expect(versions).toEqual([]);
  });

  it("returns an empty list when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const versions: BillTextVersion[] = await getBillTextVersions({ congress: "117", type: "hr", number: "3076" });

    expect(versions).toEqual([]);
  });
});

describe("getSearchResults", (): void => {
  it("filters the preview fixtures when no API key is configured", async (): Promise<void> => {
    const result: BillSearchResult = await getSearchResults(firstPreviewBill.title);

    expect(result.source).toBe("preview");
    expect(result.congressesSearched).toBe(0);
    expect(result.bills.map((bill: LegislativeBill): string => bill.title)).toContain(firstPreviewBill.title);
  });

  it("sweeps every supported Congress and returns matches sorted by most recent action", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const currentCongress: number = getCurrentCongress();

    const fetchMock = vi.fn().mockImplementation((input: unknown): Promise<Response> => {
      const url: URL = new URL(String(input));
      if (url.pathname === `/v3/bill/${currentCongress}`) {
        return Promise.resolve(
          jsonResponse({
            bills: [
              {
                congress: currentCongress,
                type: "hr",
                number: "10",
                title: "Older Broadband Grant Act",
                originChamber: "House",
                latestAction: { actionDate: "2026-01-01", text: "Introduced in House." },
              },
              {
                congress: currentCongress,
                type: "hr",
                number: "20",
                title: "Newer Broadband Access Act",
                originChamber: "House",
                latestAction: { actionDate: "2026-06-01", text: "Introduced in House." },
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ bills: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: BillSearchResult = await getSearchResults("broadband");

    expect(result.source).toBe("live");
    expect(result.congressesSearched).toBeGreaterThan(1);
    expect(result.bills.map((bill: LegislativeBill): string => bill.title)).toEqual([
      "Newer Broadband Access Act",
      "Older Broadband Grant Act",
    ]);
  });

  it("requests each Congress's page sorted by most recently updated, at the max page size", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation((): Promise<Response> => Promise.resolve(jsonResponse({ bills: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await getSearchResults("anything");

    const requestedUrl: URL = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("sort")).toBe("updateDate+desc");
    expect(requestedUrl.searchParams.get("limit")).toBe("250");
  });

  it("pins a direct citation match first, even when its own text wouldn't match the query", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const currentCongress: number = getCurrentCongress();

    const fetchMock = vi.fn().mockImplementation((input: unknown): Promise<Response> => {
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
              latestAction: { actionDate: "2020-01-01", text: "Introduced in House." },
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ bills: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: BillSearchResult = await getSearchResults("HR 284");

    expect(result.bills[0]?.title).toBe("Community Water Reliability Act");
    expect(result.bills[0]?.number).toBe("284");
  });

  it("caps results and reports truncation once more than the max match", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const currentCongress: number = getCurrentCongress();
    const manyBills = Array.from({ length: 80 }, (_: unknown, index: number) => ({
      congress: currentCongress,
      type: "hr",
      number: String(index),
      title: `Broadband Bill ${index}`,
      originChamber: "House",
      latestAction: { actionDate: "2026-01-01", text: "Introduced in House." },
    }));

    const fetchMock = vi.fn().mockImplementation((input: unknown): Promise<Response> => {
      const url: URL = new URL(String(input));
      if (url.pathname === `/v3/bill/${currentCongress}`) return Promise.resolve(jsonResponse({ bills: manyBills }));
      return Promise.resolve(jsonResponse({ bills: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: BillSearchResult = await getSearchResults("broadband");

    expect(result.truncated).toBe(true);
    expect(result.bills.length).toBeLessThanOrEqual(60);
  });
});
