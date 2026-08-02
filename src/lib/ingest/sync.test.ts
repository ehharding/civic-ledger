/**
 * Covers the sync engine and the three dataset descriptors.
 *
 * The engine's contract is three properties, and each has a failure mode that stays invisible for a long time:
 *
 * 1. A failing dataset must not cost the other two their refresh.
 * 2. A failure must be *written down* — a sync that logs an error and writes no row reports perfect freshness right up
 *    until somebody notices the data is a month old.
 * 3. The watermark must advance only over records actually stored, or a failed window is stepped over permanently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as committeeDirectory from "@/lib/congress/committee-directory";
import * as composition from "@/lib/congress/composition";
import * as ingestSource from "@/lib/congress/ingest-source";
import type { LegislativeBill } from "@/lib/congress/types";
import { type IngestDataset, ingestDatasets, MAX_RECORDS_PER_RUN } from "@/lib/ingest/datasets";
import type { EventWrite, IngestStore, RecordWrite, SyncRunWrite } from "@/lib/ingest/store";
import { runIngestion, type SyncResult } from "@/lib/ingest/sync";

const NOW: Date = new Date("2026-07-31T09:00:00.000Z");
const UPDATED_AT: Date = new Date("2026-07-30T18:30:00.000Z");

/** Not an `Error` — the shape a driver or a third-party library can genuinely reject with. */
const REJECTION_WITHOUT_AN_ERROR: string = "connection reset";

/** An in-memory store that records what it was asked to do. @see store.test.ts for the real statements. */
function fakeStore(overrides: Partial<IngestStore> = {}): IngestStore & { runs: SyncRunWrite[] } {
  const runs: SyncRunWrite[] = [];

  return {
    runs,
    latestWatermark: async (): Promise<Date | null> => null,
    upsertRecords: async (records: RecordWrite[]): Promise<number> => records.length,
    appendEvents: async (events: EventWrite[]): Promise<number> => events.length,
    recordRun: async (run: SyncRunWrite): Promise<void> => {
      runs.push(run);
    },
    listRecords: async () => [],
    findRecord: async () => null,
    recentRuns: async () => [],
    ...overrides,
  };
}

function bill(overrides: Partial<LegislativeBill> = {}): LegislativeBill {
  return {
    congress: 119,
    type: "HR",
    number: "284",
    title: "A bill to widen rural broadband access",
    originChamber: "House",
    introducedDate: "2026-01-14",
    latestAction: { date: "2026-03-02", text: "Referred to the Committee on Energy and Commerce." },
    stage: "committee",
    officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

/** A stub dataset, so the engine's own behavior can be exercised without any upstream at all. */
function stubDataset(overrides: Partial<IngestDataset> = {}): IngestDataset {
  return {
    name: "stub",
    recordType: "bill",
    windowed: true,
    collect: async () => ({ records: [], events: [], requests: 1, complete: true }),
    ...overrides,
  };
}

function recordWrite(sourceUpdatedAt: Date | null): RecordWrite {
  return {
    recordType: "bill",
    recordKey: "119-HR-284",
    congress: 119,
    title: "A bill",
    payload: bill(),
    sourceUpdatedAt,
    fetchedAt: NOW,
    payloadHash: "hash",
    providerUrl: "https://www.congress.gov/",
  };
}

beforeEach((): void => {
  vi.restoreAllMocks();
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("runIngestion", (): void => {
  it("runs each dataset and reports what it did", async (): Promise<void> => {
    const store = fakeStore();
    const dataset: IngestDataset = stubDataset({
      collect: async () => ({
        records: [recordWrite(UPDATED_AT)],
        events: [{ recordType: "bill", recordKey: "119-HR-284", summary: "Referred.", eventHash: "a" }],
        requests: 3,
        complete: true,
      }),
    });

    const [result]: SyncResult[] = await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [dataset],
    });

    expect(result).toEqual({
      dataset: "stub",
      status: "succeeded",
      recordsSeen: 1,
      recordsWritten: 1,
      eventsAppended: 1,
      requestsMade: 3,
    });
  });

  it("reads a watermark for a windowed dataset and passes it to the fetch", async (): Promise<void> => {
    const store = fakeStore({ latestWatermark: async (): Promise<Date> => UPDATED_AT });
    const collect = vi.fn(async () => ({ records: [], events: [], requests: 1, complete: true }));

    await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [stubDataset({ collect })],
    });

    expect(collect).toHaveBeenCalledWith({ apiKey: "test-key", congress: 119, since: UPDATED_AT, now: NOW });
  });

  /* Members and committees publish no per-record update timestamp, so there is no window to read from and asking for
     one would only produce a cursor that means nothing. */
  it("reads no watermark for an unwindowed dataset", async (): Promise<void> => {
    const latestWatermark = vi.fn(async (): Promise<Date | null> => null);
    const store = fakeStore({ latestWatermark });

    await runIngestion({
      store,
      apiKey: "test-key",
      now: NOW,
      congress: 119,
      datasets: [stubDataset({ windowed: false })],
    });

    expect(latestWatermark).not.toHaveBeenCalled();
  });

  /* The cursor is derived from what was written, not from when the run happened, so a run that read nothing leaves it
     where it was rather than stepping over the window it failed to read. */
  it("advances the watermark only over records it actually stored", async (): Promise<void> => {
    const store = fakeStore();
    const newest: Date = new Date("2026-07-31T08:00:00.000Z");

    await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          collect: async () => ({
            records: [recordWrite(UPDATED_AT), recordWrite(newest), recordWrite(null)],
            events: [],
            requests: 1,
            complete: true,
          }),
        }),
      ],
    });

    expect(store.runs[0]?.nextWatermark).toEqual(newest);
  });

  it("records no next watermark when nothing carried an upstream timestamp", async (): Promise<void> => {
    const store = fakeStore();

    await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          collect: async () => ({ records: [recordWrite(null)], events: [], requests: 1, complete: true }),
        }),
      ],
    });

    expect(store.runs[0]?.nextWatermark).toBeNull();
  });

  it("records a partial run when the window was not read to completion", async (): Promise<void> => {
    const store = fakeStore();

    const [result]: SyncResult[] = await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          collect: async () => ({ records: [recordWrite(UPDATED_AT)], events: [], requests: 8, complete: false }),
        }),
      ],
    });

    expect(result?.status).toBe("partial");
    expect(result?.error).toBe("Upstream window was not read to completion.");
    expect(store.runs[0]?.status).toBe("partial");
    // What was read is still written, and the cursor still advances over it.
    expect(store.runs[0]?.nextWatermark).toEqual(UPDATED_AT);
  });

  it("records a failed run and keeps going with the next dataset", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    const store = fakeStore();

    const results: SyncResult[] = await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          name: "broken",
          collect: async (): Promise<never> => {
            throw new Error("upstream unreachable");
          },
        }),
        stubDataset({ name: "healthy" }),
      ],
    });

    expect(results.map((result: SyncResult): string => result.status)).toEqual(["failed", "succeeded"]);
    expect(results[0]?.error).toBe("upstream unreachable");
    expect(store.runs[0]).toMatchObject({ dataset: "broken", status: "failed", error: "upstream unreachable" });
    expect(store.runs[1]).toMatchObject({ dataset: "healthy", status: "succeeded" });
  });

  it("describes a thrown non-Error without losing the run record", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    const store = fakeStore();

    const [result]: SyncResult[] = await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          collect: async (): Promise<never> => {
            // A bare string rather than an `Error`, which is what a driver or a third-party library can genuinely
            // throw — and what `describeError` exists to turn into something recordable.
            throw REJECTION_WITHOUT_AN_ERROR;
          },
        }),
      ],
    });

    expect(result?.error).toBe("connection reset");
    expect(store.runs[0]?.status).toBe("failed");
  });

  /* When the database is what failed, the attempt to record the failure fails too. The caller already has the failure
     in the returned result, so there is nothing useful for a second throw to do. */
  it("does not throw when even recording the failure fails", async (): Promise<void> => {
    const errorLog = vi.spyOn(console, "error").mockImplementation((): void => undefined);
    const store = fakeStore({
      recordRun: async (): Promise<never> => {
        throw new Error("database unreachable");
      },
    });

    const [result]: SyncResult[] = await runIngestion({
      store,
      apiKey: "test-key",
      congress: 119,
      now: NOW,
      datasets: [
        stubDataset({
          collect: async (): Promise<never> => {
            throw new Error("upstream unreachable");
          },
        }),
      ],
    });

    expect(result?.status).toBe("failed");
    expect(errorLog).toHaveBeenCalledWith("[ingest] Could not record the failed run:", expect.any(Error));
  });

  it("defaults to the current Congress, the current time, and every dataset", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    vi.spyOn(ingestSource, "fetchBillsUpdatedSince").mockResolvedValue({ bills: [], requests: 1, complete: true });
    vi.spyOn(composition, "fetchLiveComposition").mockResolvedValue(null);
    vi.spyOn(committeeDirectory, "fetchLiveCommittees").mockResolvedValue(null);

    const store = fakeStore();
    const results: SyncResult[] = await runIngestion({ store, apiKey: "test-key" });

    expect(results.map((result: SyncResult): string => result.dataset)).toEqual(["bills", "members", "committees"]);
  });
});

describe("ingestDatasets", (): void => {
  const [bills, members, committees] = ingestDatasets as [IngestDataset, IngestDataset, IngestDataset];

  it("windows bills and re-reads the two bounded lists whole", (): void => {
    expect(bills.windowed).toBe(true);
    expect(members.windowed).toBe(false);
    expect(committees.windowed).toBe(false);
  });

  it("turns a swept bill into a record and the action observed on it", async (): Promise<void> => {
    vi.spyOn(ingestSource, "fetchBillsUpdatedSince").mockResolvedValue({
      bills: [{ bill: bill(), sourceUpdatedAt: UPDATED_AT }],
      requests: 1,
      complete: true,
    });

    const harvest = await bills.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });

    expect(harvest.records[0]).toMatchObject({
      recordType: "bill",
      recordKey: "119-HR-284",
      congress: 119,
      sourceUpdatedAt: UPDATED_AT,
      fetchedAt: NOW,
      providerUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    });
    expect(harvest.events[0]).toMatchObject({
      recordType: "bill",
      recordKey: "119-HR-284",
      occurredOn: "2026-03-02",
      summary: "Referred to the Committee on Energy and Commerce.",
    });
  });

  it("passes the per-run record cap down to the sweep", async (): Promise<void> => {
    const sweep = vi
      .spyOn(ingestSource, "fetchBillsUpdatedSince")
      .mockResolvedValue({ bills: [], requests: 1, complete: true });

    await bills.collect({ apiKey: "test-key", congress: 119, since: UPDATED_AT, now: NOW });

    expect(sweep).toHaveBeenCalledWith({
      apiKey: "test-key",
      congress: 119,
      since: UPDATED_AT,
      maxRecords: MAX_RECORDS_PER_RUN,
    });
  });

  /* An empty action is nothing to observe, and inventing an event for it would put a row in an append-only log that
     says something happened. */
  it("emits no event for a bill carrying no action text", async (): Promise<void> => {
    vi.spyOn(ingestSource, "fetchBillsUpdatedSince").mockResolvedValue({
      bills: [{ bill: bill({ latestAction: { text: "   " } }), sourceUpdatedAt: null }],
      requests: 1,
      complete: true,
    });

    const harvest = await bills.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });

    expect(harvest.records).toHaveLength(1);
    expect(harvest.events).toHaveLength(0);
  });

  it("stores the roster the member directory itself would render", async (): Promise<void> => {
    vi.spyOn(composition, "fetchLiveComposition").mockResolvedValue([
      {
        chamber: "senate",
        members: [{ bioguideId: "L000174", name: "Leahy, Patrick J.", party: "democratic", state: "Vermont" }],
        partyCounts: [{ party: "democratic", count: 1 }],
        votingSeats: 1,
        nonVotingSeats: 0,
      },
      { chamber: "house", members: [], partyCounts: [], votingSeats: 0, nonVotingSeats: 0 },
    ]);

    const harvest = await members.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });

    expect(harvest.records).toHaveLength(1);
    expect(harvest.records[0]).toMatchObject({
      recordType: "member",
      recordKey: "L000174",
      title: "Leahy, Patrick J.",
      // The list endpoint publishes no per-record update timestamp, and inventing one would attribute this app's own
      // clock to Congress.gov.
      sourceUpdatedAt: null,
      providerUrl: "https://bioguide.congress.gov/search/bio/L000174",
    });
    expect(harvest.events).toHaveLength(0);
    expect(harvest.complete).toBe(true);
  });

  it("stores each committee against its chamber-qualified key", async (): Promise<void> => {
    vi.spyOn(committeeDirectory, "fetchLiveCommittees").mockResolvedValue([
      { systemCode: "hsag00", name: "Agriculture Committee", chamber: "house", type: "standing", subcommitteeCount: 6 },
    ]);

    const harvest = await committees.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });

    expect(harvest.records[0]).toMatchObject({
      recordType: "committee",
      recordKey: "house-hsag00",
      title: "Agriculture Committee",
      providerUrl: "https://www.congress.gov/committees",
    });
  });

  /* A live-only read: where a page would show a labeled substitute, ingestion must record a failure instead, or the
     placeholders would be filed under a live provenance. */
  it("reports an incomplete harvest rather than storing a fallback", async (): Promise<void> => {
    vi.spyOn(composition, "fetchLiveComposition").mockResolvedValue(null);
    vi.spyOn(committeeDirectory, "fetchLiveCommittees").mockResolvedValue(null);

    const roster = await members.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });
    const panels = await committees.collect({ apiKey: "test-key", congress: 119, since: null, now: NOW });

    expect(roster).toMatchObject({ records: [], events: [], complete: false });
    expect(panels).toMatchObject({ records: [], events: [], complete: false });
  });
});
