/**
 * Covers the committee record fetcher: the three endpoints' three different response shapes, the paging that is applied
 * before an offset goes upstream, the title lookups that fill in what the bills endpoint doesn't send, and the
 * distinction between an empty collection and one that could not be fetched.
 *
 * That last distinction is the load-bearing one and it is why `unavailable` exists at all. A committee that has
 * published no reports and a committee whose reports request failed both produce zero rows, and rendering the first
 * message over the second state tells a reader something false about the congressional record. No type enforces that,
 * so it gets its own cases here and in the component's tests.
 *
 * The other one worth stating: this module must never send Congress.gov a path segment it hasn't proven the shape of,
 * including segments Congress.gov itself supplied. The referred-bill lookups take their identifiers straight from an
 * upstream payload, and the case below feeds a malformed one back to confirm it is dropped rather than interpolated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCommitteeRecords } from "@/lib/congress/committee-activity";
import type { CommitteeBillReferral, CommitteeRecordsResult } from "@/lib/congress/committee-records";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** The committee-bills payload for `count` referrals, numbered so each maps to a distinct bill. */
function billsPayload(count: number, total: number = count): unknown {
  return {
    "committee-bills": {
      count: total,
      bills: Array.from({ length: count }, (_unused: unknown, index: number) => ({
        congress: 119,
        type: "HR",
        number: String(1000 + index),
        relationshipType: "Referred To",
        actionDate: "2026-07-30T12:31:05Z",
      })),
    },
    pagination: { count: total },
  };
}

/**
 * Answers the committee sub-resource request with `payload` and every bill lookup with a titled record.
 *
 * Routed on the URL rather than on call order, because the title lookups go out together and their order is not a
 * property this module promises.
 */
function stubFetch(payload: unknown, options: { billTitle?: string | null } = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: URL): Promise<Response> => {
    if (String(url).includes("/committee/")) return Promise.resolve(jsonResponse(payload));

    if (options.billTitle === null) return Promise.resolve(jsonResponse({}, 404));

    return Promise.resolve(
      jsonResponse({
        bill: {
          congress: 119,
          billType: "HR",
          billNumber: "1000",
          title: options.billTitle ?? "A Referred Measure",
          originChamber: "House",
          latestAction: { actionDate: "2026-07-30", text: "Referred to the Committee on Agriculture." },
          policyArea: { name: "Agriculture and food" },
        },
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  if (originalApiKey === undefined) {
    delete process.env.CONGRESS_API_KEY;
  } else {
    process.env.CONGRESS_API_KEY = originalApiKey;
  }
});

describe("getCommitteeRecords without a usable key or identifier", (): void => {
  it("resolves against the preview fixtures when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "preview-01",
      { kind: "bills", page: 1 },
      undefined,
    );

    expect(result.records.kind).toBe("bills");
    expect(result.records.items.length).toBeGreaterThan(0);
    expect(result.unavailable).toBe(false);
  });

  it("never sends a malformed system code upstream", async (): Promise<void> => {
    // A code that cannot be a real one is resolved locally rather than interpolated into an outbound path — the same
    // rule `getCommitteeProfile` holds, for the same reason.
    const fetchMock = stubFetch(billsPayload(1));

    await getCommitteeRecords("house", "../../secrets", { kind: "bills", page: 1 }, undefined);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends an unrecognized chamber upstream", async (): Promise<void> => {
    const fetchMock = stubFetch(billsPayload(1));

    await getCommitteeRecords("congress", "hsag00", { kind: "bills", page: 1 }, undefined);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty page for a preview code naming no placeholder committee", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "preview-nope",
      { kind: "reports", page: 1 },
      undefined,
    );

    expect(result).toEqual({
      records: { kind: "reports", items: [] },
      page: 1,
      pageCount: 1,
      total: 0,
      unavailable: false,
    });
  });
});

describe("getCommitteeRecords for referred bills", (): void => {
  it("maps the relationship and date the bill endpoints don't publish", async (): Promise<void> => {
    stubFetch(billsPayload(1));

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 1);

    expect(result.records).toEqual({
      kind: "bills",
      items: [
        expect.objectContaining({
          congress: 119,
          type: "HR",
          number: "1000",
          relationship: "Referred To",
          actionDate: "2026-07-30T12:31:05Z",
        }),
      ],
    });
  });

  it("fills in the title the committee-bills endpoint omits", async (): Promise<void> => {
    stubFetch(billsPayload(1), { billTitle: "Community Water Reliability Act" });

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 1);
    const [referral] = result.records.items as CommitteeBillReferral[];

    expect(referral?.bill?.title).toBe("Community Water Reliability Act");
  });

  it("keeps a row whose title lookup found nothing", async (): Promise<void> => {
    // Dropping it would quietly shorten a list whose length is printed directly above it.
    stubFetch(billsPayload(1), { billTitle: null });

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 1);
    const [referral] = result.records.items as CommitteeBillReferral[];

    expect(referral).toMatchObject({ type: "HR", number: "1000" });
    expect(referral?.bill).toBeUndefined();
  });

  it("issues one title lookup per row on screen and no more", async (): Promise<void> => {
    // The cost of this feature is bounded by the page size rather than by the collection's length: a committee with ten
    // thousand referrals must cost exactly what one with three does.
    const fetchMock = stubFetch(billsPayload(3, 10_205));

    await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 10_205);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not interpolate an identifier that fails the outbound-URL guard", async (): Promise<void> => {
    const fetchMock = vi.fn().mockImplementation((url: URL): Promise<Response> => {
      if (String(url).includes("/committee/")) {
        return Promise.resolve(
          jsonResponse({
            "committee-bills": {
              // A type Congress.gov does not issue. It maps cleanly — the record is complete — but must never reach an
              // outbound path.
              bills: [{ congress: 119, type: "XYZ", number: "1" }],
              count: 1,
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.records.items).toHaveLength(1);
    expect((result.records.items as CommitteeBillReferral[])[0]?.bill).toBeUndefined();
  });

  it("drops a bill lookup whose payload carries no usable record", async (): Promise<void> => {
    const fetchMock = vi.fn().mockImplementation((url: URL): Promise<Response> => {
      if (String(url).includes("/committee/")) return Promise.resolve(jsonResponse(billsPayload(1)));

      // A bill with no title doesn't survive `mapCongressBill`, which is the same outcome as no bill at all.
      return Promise.resolve(jsonResponse({ bill: { congress: 119, billType: "HR", billNumber: "1000" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 1);

    expect((result.records.items as CommitteeBillReferral[])[0]?.bill).toBeUndefined();
  });

  it("drops a referral missing part of its identifier", async (): Promise<void> => {
    // Unlike a bill from the bill endpoints, this record has no title to fall back on: without all three parts it names
    // nothing and could neither be linked nor labeled.
    stubFetch({
      "committee-bills": {
        bills: [
          { congress: 119, type: "HR" },
          { congress: 119, number: "5" },
        ],
        count: 2,
      },
    });

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 2);

    expect(result.records.items).toHaveLength(0);
  });

  it("reads the count off the collection when pagination reports none", async (): Promise<void> => {
    stubFetch({ "committee-bills": { count: 4321, bills: [] } });

    const result: CommitteeRecordsResult = await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 1 }, 9);

    expect(result.total).toBe(4321);
  });
});

describe("getCommitteeRecords for reports and nominations", (): void => {
  it("maps reports and normalizes the timestamp spelling that endpoint alone uses", async (): Promise<void> => {
    // `"2015-03-20 00:05:31+00:00"` — a space where every other endpoint sends a `T`, which `formatDate` cannot parse.
    stubFetch({
      reports: [
        {
          citation: "H. Rept. 109-710",
          congress: 109,
          type: "HRPT",
          number: 710,
          part: 1,
          updateDate: "2015-03-20 00:05:31+00:00",
        },
      ],
      pagination: { count: 142 },
    });

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "reports", page: 1 },
      142,
    );

    expect(result.records).toEqual({
      kind: "reports",
      items: [
        {
          citation: "H. Rept. 109-710",
          congress: 109,
          type: "HRPT",
          number: 710,
          part: 1,
          updateDate: "2015-03-20T00:05:31+00:00",
        },
      ],
    });
    expect(result.total).toBe(142);
  });

  it("drops a report with no citation, which is the only thing that names one", async (): Promise<void> => {
    stubFetch({ reports: [{ congress: 109, number: 710 }, { citation: "   " }], pagination: { count: 2 } });

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "reports", page: 1 },
      2,
    );

    expect(result.records.items).toHaveLength(0);
  });

  it("maps nominations, which publish their description inline", async (): Promise<void> => {
    stubFetch({
      nominations: [
        {
          citation: "PN1201-7",
          congress: 119,
          description: "Jane Doe, of Ohio, to be United States Marshal.",
          receivedDate: "2026-07-21",
          latestAction: { actionDate: "2026-07-21", text: "Referred to the Committee on the Judiciary." },
        },
      ],
      pagination: { count: 5560 },
    });

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "senate",
      "ssju00",
      { kind: "nominations", page: 1 },
      5560,
    );

    expect(result.records).toEqual({
      kind: "nominations",
      items: [
        {
          citation: "PN1201-7",
          congress: 119,
          description: "Jane Doe, of Ohio, to be United States Marshal.",
          receivedDate: "2026-07-21",
          latestAction: { date: "2026-07-21", text: "Referred to the Committee on the Judiciary." },
        },
      ],
    });
  });

  it("omits a latest action that carries no text, rather than an object of undefineds", async (): Promise<void> => {
    stubFetch({ nominations: [{ citation: "PN1", latestAction: { actionDate: "2026-07-21" } }] });

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "senate",
      "ssju00",
      { kind: "nominations", page: 1 },
      1,
    );

    expect(result.records.items[0]).toEqual({
      citation: "PN1",
      congress: undefined,
      description: undefined,
      receivedDate: undefined,
      latestAction: undefined,
    });
  });

  it("drops a nomination with no citation", async (): Promise<void> => {
    stubFetch({ nominations: [{ description: "Someone, of somewhere." }] });

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "senate",
      "ssju00",
      { kind: "nominations", page: 1 },
      1,
    );

    expect(result.records.items).toHaveLength(0);
  });
});

describe("getCommitteeRecords paging", (): void => {
  it("sends the offset the requested page starts at", async (): Promise<void> => {
    const fetchMock = stubFetch(billsPayload(0, 10_205));

    await getCommitteeRecords("house", "hsag00", { kind: "bills", page: 3 }, 10_205);

    const requested: string = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("offset=24");
    expect(requested).toContain("limit=12");
  });

  it("holds a page past the end inside the collection before any request goes out", async (): Promise<void> => {
    // The point of clamping against the profile's count: a truncated or year-old link lands on the last page rather
    // than costing a round trip that proves it overshot and then showing nothing.
    const fetchMock = stubFetch(billsPayload(0, 30));

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "bills", page: 900 },
      30,
    );

    expect(result.page).toBe(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("offset=24");
  });

  it("reports how many pages the collection fills", async (): Promise<void> => {
    stubFetch(billsPayload(0, 10_205));

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "bills", page: 1 },
      10_205,
    );

    expect(result.pageCount).toBe(Math.ceil(10_205 / 12));
  });
});

describe("getCommitteeRecords when the request doesn't succeed", (): void => {
  it("distinguishes an unavailable collection from an empty one", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => undefined);

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "reports", page: 1 },
      96,
    );

    expect(result.unavailable).toBe(true);
    expect(result.records).toEqual({ kind: "reports", items: [] });
  });

  it("treats a 404 as an empty collection, not a failure", async (): Promise<void> => {
    // A House committee has no nominations resource, and that is a true answer rather than an unreported one.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "nominations", page: 1 },
      undefined,
    );

    expect(result.unavailable).toBe(false);
    expect(result.records.items).toHaveLength(0);
  });

  it("falls back to the profile's count when the request could not report one", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    vi.spyOn(console, "error").mockImplementation((): void => undefined);

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "bills", page: 1 },
      1284,
    );

    expect(result.total).toBe(1284);
    expect(result.pageCount).toBe(Math.ceil(1284 / 12));
  });

  it("survives a payload whose collection is missing entirely", async (): Promise<void> => {
    stubFetch({});

    const result: CommitteeRecordsResult = await getCommitteeRecords(
      "house",
      "hsag00",
      { kind: "bills", page: 1 },
      undefined,
    );

    expect(result.records.items).toHaveLength(0);
    expect(result.unavailable).toBe(false);
  });
});
