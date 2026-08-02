/**
 * Covers reading the stored copy.
 *
 * Two rules run through every assertion here. Nothing throws — a database that is down has to degrade a page to its
 * next fallback exactly as an unreachable Congress.gov does, not break it. And nothing returned is ever labeled
 * `"live"`: a stored page is showing real congressional records read at a stated earlier time, which is a different
 * claim from "this is current" and has to be labeled as the different claim it is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitteeDirectoryResult } from "@/lib/congress/committee-directory";
import type { CongressComposition } from "@/lib/congress/members";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";
import type { StoredRecordRow } from "@/lib/ingest/records";
import type { IngestStore, SyncRunSummary } from "@/lib/ingest/store";
import * as store from "@/lib/ingest/store";
import {
  getIngestionFreshness,
  getStoredBill,
  getStoredBillSnapshot,
  getStoredCommitteeDirectory,
  getStoredComposition,
  listStoredRecordPaths,
  SITEMAP_RECORD_LIMIT,
} from "@/lib/ingest/stored";

const OLDER: Date = new Date("2026-07-30T09:00:00.000Z");
const NEWER: Date = new Date("2026-07-31T09:00:00.000Z");

function bill(overrides: Partial<LegislativeBill> = {}): LegislativeBill {
  return {
    congress: 119,
    type: "HR",
    number: "284",
    title: "A bill to widen rural broadband access",
    originChamber: "House",
    introducedDate: "2026-01-14",
    latestAction: { date: "2026-03-02", text: "Referred to committee." },
    stage: "committee",
    officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

function row(recordType: string, payload: unknown, fetchedAt: Date = NEWER): StoredRecordRow {
  return {
    recordType,
    recordKey: "key",
    congress: 119,
    title: "title",
    payload,
    sourceUpdatedAt: null,
    fetchedAt,
    payloadHash: "hash",
    providerUrl: "https://www.congress.gov/",
  };
}

/** Installs a store whose reads the test controls, standing in for a configured database. */
function stubStore(overrides: Partial<IngestStore> = {}): IngestStore {
  const stub: IngestStore = {
    latestWatermark: async () => null,
    upsertRecords: async () => 0,
    appendEvents: async () => 0,
    recordRun: async (): Promise<void> => undefined,
    listRecords: async () => [],
    findRecord: async () => null,
    recentRuns: async () => [],
    ...overrides,
  };

  vi.spyOn(store, "getIngestStore").mockReturnValue(stub);

  return stub;
}

/** No store at all — the state every deployment without `DATABASE_URL` is permanently in. */
function stubNoStore(): void {
  vi.spyOn(store, "getIngestStore").mockReturnValue(null);
}

beforeEach((): void => {
  vi.restoreAllMocks();
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("with no database configured", (): void => {
  it("reports nothing stored, from every read", async (): Promise<void> => {
    stubNoStore();

    await expect(getStoredBillSnapshot(119)).resolves.toBeNull();
    await expect(getStoredBill({ congress: "119", type: "hr", number: "284" })).resolves.toBeNull();
    await expect(getStoredComposition(119)).resolves.toBeNull();
    await expect(getStoredCommitteeDirectory(119)).resolves.toBeNull();
    await expect(getIngestionFreshness()).resolves.toBeNull();
    await expect(listStoredRecordPaths(119)).resolves.toEqual({ paths: [], omitted: 0 });
  });
});

describe("when the database is unreachable", (): void => {
  /* A page degrades to its next fallback and a reader is told the data is preview data — never that a query failed. */
  it("swallows the failure and reports nothing stored", async (): Promise<void> => {
    const errorLog = vi.spyOn(console, "error").mockImplementation((): void => undefined);
    stubStore({
      listRecords: async (): Promise<never> => {
        throw new Error("connection refused");
      },
    });

    await expect(getStoredBillSnapshot(119)).resolves.toBeNull();
    expect(errorLog).toHaveBeenCalledWith("[ingest] Stored read failed:", expect.any(Error));
  });
});

describe("getStoredBillSnapshot", (): void => {
  it("labels the snapshot stored, never live", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("bill", bill())] });

    const snapshot: CongressSnapshot | null = await getStoredBillSnapshot(119);

    expect(snapshot?.source).toBe("stored");
    expect(snapshot?.notice).toContain("stored earlier");
  });

  /* The banner should print when the copy was last confirmed, not when the request happened — a stored page stamped
     with "now" would be claiming the freshness of the request rather than of the data. */
  it("reports when the copy was last confirmed, not the current time", async (): Promise<void> => {
    stubStore({
      listRecords: async (): Promise<StoredRecordRow[]> => [
        row("bill", bill(), OLDER),
        row("bill", bill({ number: "285" }), NEWER),
      ],
    });

    expect((await getStoredBillSnapshot(119))?.retrievedAt).toBe(NEWER.toISOString());
  });

  /* The store orders by upstream update time; a bill list is presented newest-introduced-first. Different orders, and
     the app has one definition of the latter that a stored list goes through like any other. */
  it("re-sorts by the app's own recency rule", async (): Promise<void> => {
    stubStore({
      listRecords: async (): Promise<StoredRecordRow[]> => [
        row("bill", bill({ number: "100", introducedDate: "2026-01-02" })),
        row("bill", bill({ number: "200", introducedDate: "2026-05-20" })),
      ],
    });

    const snapshot: CongressSnapshot | null = await getStoredBillSnapshot(119);

    expect(snapshot?.bills.map((entry: LegislativeBill): string => entry.number)).toEqual(["200", "100"]);
  });

  it("reports nothing when the store is empty", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [] });

    await expect(getStoredBillSnapshot(119)).resolves.toBeNull();
  });

  /* Rows that no longer validate are dropped, and a page of nothing but those is the same as an empty page. */
  it("reports nothing when every stored payload has stopped matching the model", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("bill", { title: 42 })] });

    await expect(getStoredBillSnapshot(119)).resolves.toBeNull();
  });

  /* A row filed under the wrong type would otherwise be read as a bill it is not. */
  it("ignores a record of another type returned under a bill query", async (): Promise<void> => {
    stubStore({
      listRecords: async (): Promise<StoredRecordRow[]> => [
        row("committee", {
          systemCode: "hsag00",
          name: "Agriculture Committee",
          chamber: "house",
          type: "standing",
          subcommitteeCount: 6,
        }),
      ],
    });

    await expect(getStoredBillSnapshot(119)).resolves.toBeNull();
  });
});

describe("getStoredBill", (): void => {
  it("finds one bill by its natural identifier", async (): Promise<void> => {
    const findRecord = vi.fn(async (): Promise<StoredRecordRow> => row("bill", bill()));
    stubStore({ findRecord });

    const found = await getStoredBill({ congress: "119", type: "hr", number: "284" });

    expect(found?.bill.number).toBe("284");
    expect(found?.retrievedAt).toBe(NEWER.toISOString());
    expect(findRecord).toHaveBeenCalledWith("bill", "119-HR-284");
  });

  it("reports nothing for a bill that isn't stored", async (): Promise<void> => {
    stubStore({ findRecord: async (): Promise<null> => null });

    await expect(getStoredBill({ congress: "119", type: "hr", number: "999" })).resolves.toBeNull();
  });

  it("reports nothing when the stored payload has stopped matching the model", async (): Promise<void> => {
    stubStore({ findRecord: async (): Promise<StoredRecordRow> => row("bill", { title: 42 }) });

    await expect(getStoredBill({ congress: "119", type: "hr", number: "284" })).resolves.toBeNull();
  });
});

describe("getStoredComposition", (): void => {
  const senator = {
    bioguideId: "L000174",
    name: "Leahy, Patrick J.",
    party: "democratic",
    state: "Vermont",
    chamber: "senate",
  };
  const representative = {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    party: "republican",
    state: "Ohio",
    district: 9,
    chamber: "house",
  };

  it("rebuilds both chambers through the same grouping the live path uses", async (): Promise<void> => {
    stubStore({
      listRecords: async (): Promise<StoredRecordRow[]> => [row("member", senator), row("member", representative)],
    });

    const built: CongressComposition | null = await getStoredComposition(119);

    expect(built?.source).toBe("stored");
    expect(built?.chambers.find((chamber) => chamber.chamber === "senate")?.members).toHaveLength(1);
    expect(built?.chambers.find((chamber) => chamber.chamber === "house")?.partyCounts).toEqual([
      { party: "republican", count: 1 },
    ]);
  });

  /* "The Senate has no members" is never a true statement about a seated Congress, and a diagram showing it would read
     as one — the same rule the live path applies to a half-empty fetch. */
  it("reports nothing when either chamber has nothing stored", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("member", senator)] });

    await expect(getStoredComposition(119)).resolves.toBeNull();
  });

  it("reports nothing when no member rows are stored at all", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [] });

    await expect(getStoredComposition(119)).resolves.toBeNull();
  });

  it("ignores a record of another type returned under a member query", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("bill", bill())] });

    await expect(getStoredComposition(119)).resolves.toBeNull();
  });
});

describe("getStoredCommitteeDirectory", (): void => {
  const panel = {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    subcommitteeCount: 6,
  };

  it("labels the directory stored and names when the copy was confirmed", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("committee", panel)] });

    const directory: CommitteeDirectoryResult | null = await getStoredCommitteeDirectory(119);

    expect(directory).toMatchObject({ congress: 119, source: "stored", retrievedAt: NEWER.toISOString() });
    expect(directory?.committees[0]?.systemCode).toBe("hsag00");
  });

  it("reports nothing when the store is empty", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [] });

    await expect(getStoredCommitteeDirectory(119)).resolves.toBeNull();
  });

  it("ignores a record of another type returned under a committee query", async (): Promise<void> => {
    stubStore({ listRecords: async (): Promise<StoredRecordRow[]> => [row("bill", bill())] });

    await expect(getStoredCommitteeDirectory(119)).resolves.toBeNull();
  });
});

describe("listStoredRecordPaths", (): void => {
  it("enumerates every stored record as an in-app path", async (): Promise<void> => {
    stubStore({
      listRecords: async ({ recordType }): Promise<StoredRecordRow[]> => {
        if (recordType === "bill") return [row("bill", bill())];
        if (recordType === "member") {
          return [
            row("member", {
              bioguideId: "L000174",
              name: "Leahy, Patrick J.",
              party: "democratic",
              chamber: "senate",
            }),
          ];
        }
        return [
          row("committee", {
            systemCode: "hsag00",
            name: "Agriculture Committee",
            chamber: "house",
            type: "standing",
            subcommitteeCount: 6,
          }),
        ];
      },
    });

    await expect(listStoredRecordPaths(119)).resolves.toEqual({
      paths: ["/bills/119/hr/284", "/members/L000174", "/committees/house/hsag00"],
      omitted: 0,
    });
  });

  it("skips a type with nothing stored rather than failing the whole enumeration", async (): Promise<void> => {
    stubStore({
      listRecords: async ({ recordType }): Promise<StoredRecordRow[]> =>
        recordType === "bill" ? [row("bill", bill())] : [],
    });

    await expect(listStoredRecordPaths(119)).resolves.toEqual({ paths: ["/bills/119/hr/284"], omitted: 0 });
  });

  /* One row past the cap is requested so "there were more" is an observation rather than an inference from a full
     page — a count that exactly equals the cap is otherwise indistinguishable from a set that happened to fit. */
  it("caps what it lists and counts what it dropped", async (): Promise<void> => {
    const overflowing: StoredRecordRow[] = Array.from({ length: SITEMAP_RECORD_LIMIT + 3 }, (_u, index: number) =>
      row("bill", bill({ number: String(index) })),
    );
    stubStore({
      listRecords: async ({ recordType }): Promise<StoredRecordRow[]> => (recordType === "bill" ? overflowing : []),
    });

    const listed = await listStoredRecordPaths(119);

    expect(listed.paths).toHaveLength(SITEMAP_RECORD_LIMIT);
    expect(listed.omitted).toBe(3);
  });

  it("asks for one row past the cap, so the overflow is visible", async (): Promise<void> => {
    const listRecords = vi.fn(async (): Promise<StoredRecordRow[]> => []);
    stubStore({ listRecords });

    await listStoredRecordPaths(119);

    expect(listRecords).toHaveBeenCalledWith({
      recordType: "bill",
      congress: 119,
      limit: SITEMAP_RECORD_LIMIT + 1,
    });
  });
});

describe("getIngestionFreshness", (): void => {
  function run(dataset: string, startedAt: Date, overrides: Partial<SyncRunSummary> = {}): SyncRunSummary {
    return {
      dataset,
      startedAt,
      finishedAt: startedAt,
      status: "succeeded",
      recordsWritten: 4,
      error: null,
      ...overrides,
    };
  }

  /* The failure a scheduled job is uniquely good at hiding is the quiet one: a sync erroring for a week looks, from
     every other angle, exactly like one that has been working. The newest run *per dataset* is where it shows. */
  it("keeps only the newest run of each dataset", async (): Promise<void> => {
    stubStore({
      recentRuns: async (): Promise<SyncRunSummary[]> => [
        run("bills", NEWER),
        run("bills", OLDER, { recordsWritten: 99 }),
        run("members", OLDER, { status: "failed", error: "upstream unreachable" }),
      ],
    });

    const freshness = await getIngestionFreshness();

    expect(freshness).toEqual([
      {
        dataset: "bills",
        status: "succeeded",
        startedAt: NEWER.toISOString(),
        finishedAt: NEWER.toISOString(),
        recordsWritten: 4,
        error: null,
      },
      {
        dataset: "members",
        status: "failed",
        startedAt: OLDER.toISOString(),
        finishedAt: OLDER.toISOString(),
        recordsWritten: 4,
        error: "upstream unreachable",
      },
    ]);
  });

  it("reports a run still in flight as unfinished", async (): Promise<void> => {
    stubStore({ recentRuns: async (): Promise<SyncRunSummary[]> => [run("bills", NEWER, { finishedAt: null })] });

    expect((await getIngestionFreshness())?.[0]?.finishedAt).toBeNull();
  });

  it("reports an empty list when nothing has ever run", async (): Promise<void> => {
    stubStore({ recentRuns: async (): Promise<SyncRunSummary[]> => [] });

    await expect(getIngestionFreshness()).resolves.toEqual([]);
  });
});
