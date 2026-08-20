/**
 * Covers client.ts's three main paths: the no-key preview fallback, mapping live API responses (list- and
 * detail-endpoint field-name variants both need coverage — see mapCongressBill), and the distinction between "not
 * found" (404) and "temporarily unavailable" (any other failure).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillSearchResponse } from "@/lib/api-contract";
import type { BillSummary, BillTextVersion, CongressSnapshot, LegislativeBill } from "@/lib/congress/bills/model";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type BillLookupResult,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getCongressComposition,
  getCongressSnapshot,
  getCongressSnapshotForCongress,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/client";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { ChamberComposition, CongressComposition, CongressMember } from "@/lib/congress/members/model";
import { firstPreviewBill, previewBills } from "@/lib/congress/upstream/fixtures";

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
    const { entries: summaries }: BillSubResource<BillSummary> = await getBillSummaries({
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

    const { entries: summaries }: BillSubResource<BillSummary> = await getBillSummaries({
      congress: "50",
      type: "hr",
      number: "1",
    });

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

    const { entries: summaries }: BillSubResource<BillSummary> = await getBillSummaries({
      congress: "117",
      type: "hr",
      number: "3076",
    });

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ actionDesc: "Public Law", actionDate: "2022-04-06" });
    expect(summaries[0]?.html).toBe("<p>As enacted.</p>alert(1)");
    expect(summaries[1]).toMatchObject({ actionDesc: "Introduced in House", actionDate: "2021-05-11" });
  });

  it("returns an empty list on a 404", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const { entries: summaries }: BillSubResource<BillSummary> = await getBillSummaries({
      congress: "119",
      type: "hr",
      number: "999999",
    });

    expect(summaries).toEqual([]);
  });

  it("returns an empty list when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { entries: summaries }: BillSubResource<BillSummary> = await getBillSummaries({
      congress: "117",
      type: "hr",
      number: "3076",
    });

    expect(summaries).toEqual([]);
  });
});

describe("getBillTextVersions", (): void => {
  it("returns an empty list when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const { entries: versions }: BillSubResource<BillTextVersion> = await getBillTextVersions({
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

    const { entries: versions }: BillSubResource<BillTextVersion> = await getBillTextVersions({
      congress: "117",
      type: "hr",
      number: "3076",
    });

    expect(versions).toHaveLength(2);
    expect(versions[0]?.type).toBe("Engrossed in House");
    expect(versions[0]?.formats).toHaveLength(1);
    expect(versions[1]?.type).toBe("Introduced in House");
  });

  it("returns an empty list on a 404", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const { entries: versions }: BillSubResource<BillTextVersion> = await getBillTextVersions({
      congress: "119",
      type: "hr",
      number: "999999",
    });

    expect(versions).toEqual([]);
  });

  it("returns an empty list when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { entries: versions }: BillSubResource<BillTextVersion> = await getBillTextVersions({
      congress: "117",
      type: "hr",
      number: "3076",
    });

    expect(versions).toEqual([]);
  });
});

describe("getSearchResults", (): void => {
  it("filters the preview fixtures when no API key is configured", async (): Promise<void> => {
    const result: BillSearchResponse = await getSearchResults(firstPreviewBill.title);

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

    const result: BillSearchResponse = await getSearchResults("broadband");

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

    const result: BillSearchResponse = await getSearchResults("HR 284");

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

    const result: BillSearchResponse = await getSearchResults("broadband");

    expect(result.truncated).toBe(true);
    expect(result.bills.length).toBeLessThanOrEqual(60);
  });
});

/** Builds a member-list entry in the shape the Congress.gov member *list* endpoint actually returns. */
function apiMember(overrides: {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number;
  chamber?: string;
}): unknown {
  return {
    bioguideId: overrides.bioguideId ?? "X000001",
    name: overrides.name ?? "Doe, Jane",
    partyName: overrides.partyName ?? "Democratic",
    state: overrides.state ?? "Ohio",
    ...(overrides.district === undefined ? {} : { district: overrides.district }),
    terms: { item: [{ chamber: overrides.chamber ?? "House of Representatives", startYear: 2025 }] },
  };
}

/** The composition's entry for one chamber, which is always present even when that chamber came back empty. */
function chamberOf(composition: CongressComposition, chamber: "house" | "senate"): ChamberComposition {
  const found: ChamberComposition | undefined = composition.chambers.find(
    (entry: ChamberComposition): boolean => entry.chamber === chamber,
  );
  if (!found) throw new Error(`Composition is missing the ${chamber}`);

  return found;
}

describe("getCongressComposition", (): void => {
  it("returns labeled placeholder seats when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const composition: CongressComposition = await getCongressComposition();

    expect(composition.source).toBe("preview");
    expect(composition.notice).toMatch(/placeholder/i);
    // The placeholders still fill both chambers, so the chart's layout and legend work without a key.
    expect(chamberOf(composition, "house").members.length).toBeGreaterThan(0);
    expect(chamberOf(composition, "senate").members.length).toBeGreaterThan(0);
    // And they are never named as if they were real members.
    expect(chamberOf(composition, "house").members[0]?.name).toMatch(/^Preview Seat/);
  });

  it("maps live members into their chambers", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          members: [
            apiMember({ bioguideId: "B000001", name: "Bennett, Marcus T.", state: "Ohio", district: 9 }),
            apiMember({
              bioguideId: "A000002",
              name: "Alvarez, Priya R.",
              partyName: "Republican",
              state: "Arizona",
              chamber: "Senate",
            }),
          ],
          pagination: { count: 2 },
        }),
      ),
    );

    const composition: CongressComposition = await getCongressComposition(119);

    expect(composition.source).toBe("live");
    expect(composition.congress).toBe(119);
    expect(chamberOf(composition, "house").members).toEqual([
      {
        bioguideId: "B000001",
        name: "Bennett, Marcus T.",
        party: "democratic",
        partyName: "Democratic",
        state: "Ohio",
        district: 9,
      } satisfies CongressMember,
    ]);
    expect(chamberOf(composition, "senate").members[0]?.party).toBe("republican");
  });

  it("asks only for the members currently seated, so a replaced member isn't counted twice", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        members: [apiMember({}), apiMember({ chamber: "Senate" })],
        pagination: { count: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const current: number = getCurrentCongress();
    await getCongressComposition(current);

    const requested: URL = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe(`/v3/member/congress/${current}`);
    expect(requested.searchParams.get("currentMember")).toBe("true");
    expect(requested.searchParams.get("limit")).toBe("250");
  });

  it("asks for the whole historical roster of a Congress that has already risen", async (): Promise<void> => {
    // The mirror image of the rule above, and Congress.gov's own recommendation. `currentMember=true` answers the 117th
    // Congress with the 377 of its members still serving today, against 557 who actually served in it — a chamber
    // diagram drawn from the first would be missing a third of its seats while presenting itself as the whole body.
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        members: [apiMember({}), apiMember({ chamber: "Senate" })],
        pagination: { count: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCongressComposition(getCurrentCongress() - 1);

    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("currentMember")).toBe("false");
  });

  it("pages through a full Congress rather than stopping at the API's 250-record ceiling", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation((input: unknown): Promise<Response> => {
      const offset: string = new URL(String(input)).searchParams.get("offset") ?? "0";
      const chamber: string = offset === "0" ? "House of Representatives" : "Senate";

      return Promise.resolve(
        jsonResponse({
          members: Array.from({ length: 250 }, (_unused: unknown, index: number) =>
            apiMember({ bioguideId: `${offset}-${index}`, chamber }),
          ),
          pagination: { count: 540 },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const composition: CongressComposition = await getCongressComposition(119);

    // 540 records across a 250-per-request ceiling is three pages.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(chamberOf(composition, "house").members).toHaveLength(250);
    expect(chamberOf(composition, "senate").members).toHaveLength(500);
  });

  it("drops records with no recognizable chamber instead of misfiling them", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          members: [
            apiMember({}),
            apiMember({ chamber: "Senate" }),
            apiMember({ bioguideId: "Z000009", chamber: "Territorial Assembly" }),
            { name: "No terms at all" },
          ],
          pagination: { count: 4 },
        }),
      ),
    );

    const composition: CongressComposition = await getCongressComposition(119);

    expect(chamberOf(composition, "house").members).toHaveLength(1);
    expect(chamberOf(composition, "senate").members).toHaveLength(1);
  });

  it("counts the House's non-voting seats separately from its voting ones", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          members: [
            apiMember({ bioguideId: "H000001", state: "Ohio", district: 9 }),
            apiMember({ bioguideId: "H000002", state: "Guam", district: 0 }),
            apiMember({ bioguideId: "S000001", chamber: "Senate", state: "Arizona" }),
          ],
          pagination: { count: 3 },
        }),
      ),
    );

    const house: ChamberComposition = chamberOf(await getCongressComposition(119), "house");

    expect(house.votingSeats).toBe(1);
    expect(house.nonVotingSeats).toBe(1);
  });

  it("falls back to placeholder seats when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const composition: CongressComposition = await getCongressComposition(119);

    expect(composition.source).toBe("preview");
    expect(composition.notice).toMatch(/temporarily unavailable/i);
  });

  it("falls back rather than rendering a Congress with one empty chamber", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ members: [apiMember({})], pagination: { count: 1 } })),
    );

    const composition: CongressComposition = await getCongressComposition(119);

    // A House-only response would otherwise render as "the Senate has no members", which is never true.
    expect(composition.source).toBe("preview");
  });
});

describe("getCongressComposition pagination edges", (): void => {
  it("treats a first page carrying no members as nothing to draw", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    // A 200 with no `members` key: the request succeeded, so this is not an outage — there is simply nobody in it, and
    // an empty chart falls back to the labeled placeholders rather than claiming the chamber is unstaffed.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ pagination: { count: 0 } })));

    const composition: CongressComposition = await getCongressComposition(119);

    expect(composition.source).toBe("preview");
  });

  it("stops after one page when the payload carries no pagination count to page through", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ members: [apiMember({}), apiMember({ bioguideId: "S000001", chamber: "Senate" })] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const composition: CongressComposition = await getCongressComposition(119);

    // Without a count, the members in hand are the whole roster as far as this fetcher can tell.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(composition.source).toBe("live");
    expect(chamberOf(composition, "house").members).toHaveLength(1);
  });

  it("draws the seats that did arrive when a later page brings back nothing", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: unknown): Promise<Response> => {
        const offset: string = new URL(String(input)).searchParams.get("offset") ?? "0";
        if (offset === "0") {
          return Promise.resolve(
            jsonResponse({
              members: Array.from({ length: 250 }, (_unused: unknown, index: number) =>
                apiMember({
                  bioguideId: `A-${index}`,
                  // Both chambers seated on the first page, so the fallback that fires for an empty chamber cannot mask
                  // what this case is actually about.
                  chamber: index % 2 === 0 ? "House of Representatives" : "Senate",
                }),
              ),
              pagination: { count: 400 },
            }),
          );
        }
        // A 200 with no `members` key rather than a failure — the page is real, it just carried nothing.
        return Promise.resolve(jsonResponse({ pagination: { count: 400 } }));
      }),
    );

    const composition: CongressComposition = await getCongressComposition(119);

    // A chart of most of the chamber still beats no chart at all; the missing seats simply aren't drawn.
    expect(composition.source).toBe("live");
    expect(chamberOf(composition, "house").members).toHaveLength(125);
    expect(chamberOf(composition, "senate").members).toHaveLength(125);
  });
});
