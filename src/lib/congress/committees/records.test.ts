/**
 * Covers the committee record model's URL rules and paging arithmetic.
 *
 * The load-bearing cases here are the total ones. Every parser below has to resolve *any* input to something usable,
 * because these params arrive from a URL bar that gets hand-edited, truncated by chat clients, and opened a year after
 * it was shared — and a committee page is a link people send. A `?page=` of `"seventeen"`, `"-4"`, `"1e999"`, or
 * nothing at all must all land on a readable page rather than an error, and each of those is tested rather than
 * assumed.
 *
 * The round trip is tested as a round trip: whatever `committeeRecordsQueryString` writes,
 * `parseCommitteeRecordsQuery` has to read back as the same view. That is the one property that makes a shared link
 * mean the same thing to the route that resolved it and to the browser that opened it.
 */
import { describe, expect, it } from "vitest";

import {
  COMMITTEE_RECORDS_PAGE_SIZE,
  type CommitteeRecordKind,
  type CommitteeRecordsQuery,
  clampCommitteeRecordsPage,
  committeeRecordKindDescriptions,
  committeeRecordKindLabels,
  committeeRecordKinds,
  committeeRecordsOffset,
  committeeRecordsPageCount,
  committeeRecordsQueryString,
  DEFAULT_COMMITTEE_RECORDS_QUERY,
  describeCommitteeRecordsPage,
  MAX_COMMITTEE_RECORDS_PAGE,
  pageOfCommitteeRecords,
  parseCommitteeRecordKind,
  parseCommitteeRecordsPage,
  parseCommitteeRecordsQuery,
} from "@/lib/congress/committees/records";

function query(overrides: Partial<CommitteeRecordsQuery> = {}): CommitteeRecordsQuery {
  return { ...DEFAULT_COMMITTEE_RECORDS_QUERY, ...overrides };
}

describe("the record kinds", (): void => {
  it("labels and describes every kind", (): void => {
    // A kind added to the union without wording added beside it would render a blank tab, which no type catches.
    for (const kind of committeeRecordKinds) {
      expect(committeeRecordKindLabels[kind].length).toBeGreaterThan(0);
      expect(committeeRecordKindDescriptions[kind].length).toBeGreaterThan(0);
    }
  });

  it("says outright that only Senate committees receive nominations", (): void => {
    // Without this, the House's permanently empty nominations tab reads as missing data rather than as a fact.
    expect(committeeRecordKindDescriptions.nominations).toMatch(/Only Senate committees receive them/);
  });

  it("says a referral is not a verdict", (): void => {
    expect(committeeRecordKindDescriptions.bills).toMatch(/not that it was taken up, amended, or reported out/);
  });
});

describe("parseCommitteeRecordKind", (): void => {
  it("accepts each kind by name", (): void => {
    for (const kind of committeeRecordKinds) expect(parseCommitteeRecordKind(kind)).toBe(kind);
  });

  it("matches case-insensitively after trimming", (): void => {
    expect(parseCommitteeRecordKind("  Reports ")).toBe("reports");
  });

  it("falls back to bills for anything else", (): void => {
    for (const raw of [null, undefined, "", "votes", "hearings"]) {
      expect(parseCommitteeRecordKind(raw)).toBe("bills");
    }
  });
});

describe("parseCommitteeRecordsPage", (): void => {
  it("reads a whole page number", (): void => {
    expect(parseCommitteeRecordsPage("7")).toBe(7);
  });

  it("resolves an absent, blank, or non-numeric param to the first page", (): void => {
    for (const raw of [null, undefined, "", "   ", "seventeen", "page-2"]) {
      expect(parseCommitteeRecordsPage(raw)).toBe(1);
    }
  });

  it("floors a fractional page rather than rejecting it", (): void => {
    expect(parseCommitteeRecordsPage("3.9")).toBe(3);
  });

  it("clamps zero and negatives up to the first page", (): void => {
    expect(parseCommitteeRecordsPage("0")).toBe(1);
    expect(parseCommitteeRecordsPage("-40")).toBe(1);
  });

  it("clamps an absurd page rather than sending its offset upstream", (): void => {
    // Congress.gov will spend real time answering an offset in the millions. Nothing in this UI can reach one.
    expect(parseCommitteeRecordsPage("999999999")).toBe(MAX_COMMITTEE_RECORDS_PAGE);
    expect(parseCommitteeRecordsPage("1e999")).toBe(1);
  });
});

describe("parseCommitteeRecordsQuery", (): void => {
  it("reads both params", (): void => {
    expect(parseCommitteeRecordsQuery(new URLSearchParams("records=nominations&page=4"))).toEqual({
      kind: "nominations",
      page: 4,
    });
  });

  it("resolves a bare URL to the first page of referred bills", (): void => {
    expect(parseCommitteeRecordsQuery(new URLSearchParams())).toEqual(DEFAULT_COMMITTEE_RECORDS_QUERY);
  });

  it("degrades a stale or hand-edited param rather than failing the page", (): void => {
    expect(parseCommitteeRecordsQuery(new URLSearchParams("records=roll-calls&page=nope"))).toEqual({
      kind: "bills",
      page: 1,
    });
  });
});

describe("committeeRecordsQueryString", (): void => {
  it("writes nothing for the default view", (): void => {
    // A committee page showing the first page of its bills should have a clean URL, not one carrying two params that
    // both say "the default".
    expect(committeeRecordsQueryString(DEFAULT_COMMITTEE_RECORDS_QUERY)).toBe("");
  });

  it("writes only what isn't default", (): void => {
    expect(committeeRecordsQueryString(query({ kind: "reports" }))).toBe("?records=reports");
    expect(committeeRecordsQueryString(query({ page: 3 }))).toBe("?page=3");
  });

  it("writes both in a fixed order, so the same view always produces the same string", (): void => {
    expect(committeeRecordsQueryString({ kind: "nominations", page: 12 })).toBe("?records=nominations&page=12");
  });

  it("round-trips every view back through the parser", (): void => {
    for (const kind of committeeRecordKinds) {
      for (const page of [1, 2, 57]) {
        const original: CommitteeRecordsQuery = { kind, page };
        const serialized: string = committeeRecordsQueryString(original);

        expect(parseCommitteeRecordsQuery(new URLSearchParams(serialized))).toEqual(original);
      }
    }
  });
});

describe("the paging arithmetic", (): void => {
  it("counts pages by the page size", (): void => {
    expect(committeeRecordsPageCount(COMMITTEE_RECORDS_PAGE_SIZE)).toBe(1);
    expect(committeeRecordsPageCount(COMMITTEE_RECORDS_PAGE_SIZE + 1)).toBe(2);
    expect(committeeRecordsPageCount(10_205)).toBe(Math.ceil(10_205 / COMMITTEE_RECORDS_PAGE_SIZE));
  });

  it("gives an empty or unreported collection one page", (): void => {
    // The page it has is the one that says it is empty. Returning zero would make "Page 1 of 0" reachable.
    for (const total of [0, -3, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(committeeRecordsPageCount(total)).toBe(1);
    }
  });

  it("holds a requested page inside the collection that exists", (): void => {
    expect(clampCommitteeRecordsPage(99, 30)).toBe(committeeRecordsPageCount(30));
    expect(clampCommitteeRecordsPage(2, 30)).toBe(2);
    expect(clampCommitteeRecordsPage(0, 30)).toBe(1);
  });

  it("cannot clamp against a count Congress.gov didn't report", (): void => {
    // With no total in hand there is nothing to clamp to, so the request goes out and the response's own count settles
    // it. Landing on page 1 here would silently ignore a link the reader followed.
    expect(clampCommitteeRecordsPage(5, undefined)).toBe(1);
  });

  it("turns a page into an offset", (): void => {
    expect(committeeRecordsOffset(1)).toBe(0);
    expect(committeeRecordsOffset(3)).toBe(COMMITTEE_RECORDS_PAGE_SIZE * 2);
    expect(committeeRecordsOffset(0)).toBe(0);
  });
});

describe("pageOfCommitteeRecords", (): void => {
  const reports = Array.from({ length: 30 }, (_unused: unknown, index: number) => ({
    citation: `PREVIEW Rept. 119-${index}`,
  }));

  it("slices the requested page out of a complete collection", (): void => {
    const result = pageOfCommitteeRecords("reports", reports, 2);

    expect(result.records.kind).toBe("reports");
    expect(result.records.items).toHaveLength(COMMITTEE_RECORDS_PAGE_SIZE);
    expect(result.records.items[0]).toEqual({ citation: `PREVIEW Rept. 119-${COMMITTEE_RECORDS_PAGE_SIZE}` });
    expect(result).toMatchObject({ page: 2, total: 30, unavailable: false });
  });

  it("clamps a page past the end onto the last one", (): void => {
    const result = pageOfCommitteeRecords("reports", reports, 99);

    expect(result.page).toBe(committeeRecordsPageCount(30));
    expect(result.records.items).toHaveLength(30 % COMMITTEE_RECORDS_PAGE_SIZE);
  });

  it("reports one empty page for an empty collection", (): void => {
    expect(pageOfCommitteeRecords("bills", [], 4)).toEqual({
      records: { kind: "bills", items: [] },
      page: 1,
      pageCount: 1,
      total: 0,
      unavailable: false,
    });
  });
});

describe("describeCommitteeRecordsPage", (): void => {
  it("says nothing when there is nothing on screen", (): void => {
    // The empty state has its own wording, which distinguishes "none" from "the request failed".
    expect(describeCommitteeRecordsPage({ shown: 0, page: 1, total: 0 })).toBe("");
  });

  it("states a plain count for a collection that fits on one page", (): void => {
    expect(describeCommitteeRecordsPage({ shown: 5, page: 1, total: 5 })).toBe("5 on file.");
  });

  it("states the range, the total, and whose order it is in", (): void => {
    // The ordering clause is the honest part: Congress.gov publishes these in no documented order, so this page pages
    // its sequence rather than claiming either end is the most recent.
    const copy: string = describeCommitteeRecordsPage({
      shown: COMMITTEE_RECORDS_PAGE_SIZE,
      page: 2,
      total: 10_205,
    });

    expect(copy).toBe("Showing 13–24 of 10,205, in the order Congress.gov publishes them.");
  });

  it("never claims a page is the most recent", (): void => {
    for (const page of [1, 2, 851]) {
      const copy: string = describeCommitteeRecordsPage({ shown: 12, page, total: 10_205 });

      expect(copy).not.toMatch(/recent|newest|latest|oldest/i);
    }
  });

  it("falls back to the range it can see when no total was reported", (): void => {
    expect(describeCommitteeRecordsPage({ shown: 12, page: 3, total: undefined })).toBe(
      "Showing 25–36 of 36, in the order Congress.gov publishes them.",
    );
  });
});

describe("the default view", (): void => {
  it("is the first page of referred bills", (): void => {
    // Bills because every chamber's committees have them: defaulting to nominations would open every House committee
    // on a tab that is empty by construction.
    const kind: CommitteeRecordKind = DEFAULT_COMMITTEE_RECORDS_QUERY.kind;

    expect(kind).toBe("bills");
    expect(DEFAULT_COMMITTEE_RECORDS_QUERY.page).toBe(1);
  });
});
