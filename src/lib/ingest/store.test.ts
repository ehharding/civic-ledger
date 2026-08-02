/**
 * Covers every statement the ingestion tables are read and written with.
 *
 * These run against a real Drizzle instance over `drizzle-orm/pg-proxy`, so the assertions are about the SQL actually
 * generated rather than about a mock having been called. Two properties are worth pinning that way and are hard to pin
 * any other way: the upsert only touches rows whose payload hash changed, and the record listing sorts nulls last.
 * Both are one clause in a generated statement, and both are silently wrong if that clause disappears.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIngestStore, getIngestStore, type IngestStore, type RecordWrite } from "@/lib/ingest/store";
import { createProxyDatabase, type ProxyCall, type ProxyDatabase } from "@/test/proxy-database";

const originalDatabaseUrl: string | undefined = process.env.DATABASE_URL;

const FETCHED_AT: Date = new Date("2026-07-31T09:00:00.000Z");
const SOURCE_UPDATED_AT: Date = new Date("2026-07-30T18:30:00.000Z");

function billWrite(overrides: Partial<RecordWrite> = {}): RecordWrite {
  return {
    recordType: "bill",
    recordKey: "119-HR-284",
    congress: 119,
    title: "A bill to do a thing",
    payload: { number: "284" },
    sourceUpdatedAt: SOURCE_UPDATED_AT,
    fetchedAt: FETCHED_AT,
    payloadHash: "hash-1",
    providerUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

/** One stored row, positionally, in `congressional_records` column order. */
function recordRow(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const row = {
    recordType: "bill",
    recordKey: "119-HR-284",
    congress: 119,
    title: "A bill to do a thing",
    payload: { number: "284" },
    sourceUpdatedAt: SOURCE_UPDATED_AT.toISOString(),
    fetchedAt: FETCHED_AT.toISOString(),
    payloadHash: "hash-1",
    providerUrl: "https://www.congress.gov/",
    ...overrides,
  };

  return [
    row.recordType,
    row.recordKey,
    row.congress,
    row.title,
    row.payload,
    row.sourceUpdatedAt,
    row.fetchedAt,
    row.payloadHash,
    row.providerUrl,
  ];
}

beforeEach((): void => {
  delete process.env.DATABASE_URL;
});

afterEach((): void => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("latestWatermark", (): void => {
  it("asks for the newest upstream timestamp of one type in one Congress", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [["2026-07-30T18:30:00.000Z"]]);

    const watermark: Date | null = await createIngestStore(db).latestWatermark("bill", 119);

    // A `Date`, not the string the driver returned — the read goes through the column's own codec rather than through
    // an untyped aggregate, which is what makes the return type true on any driver.
    expect(watermark).toEqual(SOURCE_UPDATED_AT);
    expect(calls[0]?.sql).toContain('order by "congressional_records"."source_updated_at" desc nulls last');
    expect(calls[0]?.params).toEqual(["bill", 119, 1]);
  });

  it("reports no watermark when nothing is stored, so the next fetch is unwindowed", async (): Promise<void> => {
    const { db }: ProxyDatabase = createProxyDatabase((): unknown[][] => [[null]]);

    await expect(createIngestStore(db).latestWatermark("bill", 119)).resolves.toBeNull();
  });

  /* An aggregate always returns a row, but a driver that returned none must not become an exception on a read the
     serving path takes. */
  it("reports no watermark when the query returns no row at all", async (): Promise<void> => {
    const { db }: ProxyDatabase = createProxyDatabase((): unknown[][] => []);

    await expect(createIngestStore(db).latestWatermark("bill", 119)).resolves.toBeNull();
  });
});

describe("upsertRecords", (): void => {
  it("writes nothing, and issues no statement, for an empty batch", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase();

    await expect(createIngestStore(db).upsertRecords([])).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });

  /* The clause the whole freshness story rests on: an unchanged record is not rewritten, so `fetched_at` keeps saying
     when this app last saw a change rather than when it last ran a query. */
  it("updates only rows whose payload hash actually differs", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [["119-HR-284"]]);

    const written: number = await createIngestStore(db).upsertRecords([billWrite()]);

    expect(written).toBe(1);
    expect(calls[0]?.sql).toContain('on conflict ("record_type","record_key") do update set');
    expect(calls[0]?.sql).toContain('where "congressional_records"."payload_hash" <> excluded.payload_hash');
  });

  /* Counted from RETURNING rather than from the batch length, which is what makes "records written" in a sync run a
     real number instead of a restatement of "records seen". */
  it("counts what the database reported writing, not what it was handed", async (): Promise<void> => {
    const { db }: ProxyDatabase = createProxyDatabase((): unknown[][] => [["119-HR-284"]]);

    const written: number = await createIngestStore(db).upsertRecords([
      billWrite(),
      billWrite({ recordKey: "119-S-917", payloadHash: "hash-2" }),
    ]);

    expect(written).toBe(1);
  });

  it("carries every provenance column into the conflict update", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase();

    await createIngestStore(db).upsertRecords([billWrite()]);

    for (const column of ["source_updated_at", "fetched_at", "payload_hash", "provider_url"]) {
      expect(calls[0]?.sql, column).toContain(`excluded.${column}`);
    }
  });
});

describe("appendEvents", (): void => {
  it("appends nothing, and issues no statement, for an empty batch", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase();

    await expect(createIngestStore(db).appendEvents([])).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });

  /* Idempotence is a unique index rather than a read-then-write check, so two overlapping syncs cannot both decide an
     action is new. */
  it("ignores an action already on file, and counts only the genuinely new ones", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [
      ["11111111-1111-1111-1111-111111111111"],
    ]);

    const appended: number = await createIngestStore(db).appendEvents([
      { recordType: "bill", recordKey: "119-HR-284", occurredOn: "2026-07-30", summary: "Referred.", eventHash: "a" },
      { recordType: "bill", recordKey: "119-S-917", summary: "Introduced.", eventHash: "b" },
    ]);

    expect(appended).toBe(1);
    expect(calls[0]?.sql).toContain('on conflict ("event_hash") do nothing');
  });
});

describe("recordRun", (): void => {
  it("writes the run, including a failed one", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase();

    await createIngestStore(db).recordRun({
      dataset: "bills",
      startedAt: FETCHED_AT,
      finishedAt: FETCHED_AT,
      status: "failed",
      watermark: null,
      nextWatermark: null,
      recordsSeen: 0,
      recordsWritten: 0,
      eventsAppended: 0,
      requestsMade: 0,
      error: "upstream unreachable",
    });

    expect(calls[0]?.sql).toContain('insert into "sync_runs"');
    expect(calls[0]?.params).toEqual(expect.arrayContaining(["bills", "failed", "upstream unreachable"]));
  });
});

describe("listRecords", (): void => {
  /* Postgres sorts nulls first under DESC, which would put every record whose endpoint publishes no update timestamp
     ahead of every record that has one — exactly backwards for a list whose ordering claim is recency. */
  it("orders by upstream update time, newest first, with undated records last", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [recordRow()]);

    const rows = await createIngestStore(db).listRecords({ recordType: "bill", congress: 119, limit: 12 });

    expect(calls[0]?.sql).toContain('order by "congressional_records"."source_updated_at" desc nulls last');
    expect(calls[0]?.params).toEqual(["bill", 119, 12]);
    expect(rows[0]).toMatchObject({
      recordType: "bill",
      recordKey: "119-HR-284",
      congress: 119,
      payload: { number: "284" },
      fetchedAt: FETCHED_AT,
      sourceUpdatedAt: SOURCE_UPDATED_AT,
    });
  });
});

describe("findRecord", (): void => {
  it("looks one record up by its natural key", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [recordRow()]);

    const row = await createIngestStore(db).findRecord("bill", "119-HR-284");

    expect(row?.recordKey).toBe("119-HR-284");
    expect(calls[0]?.params).toEqual(["bill", "119-HR-284", 1]);
  });

  it("reports null for a record that isn't stored", async (): Promise<void> => {
    const { db }: ProxyDatabase = createProxyDatabase((): unknown[][] => []);

    await expect(createIngestStore(db).findRecord("bill", "119-HR-999")).resolves.toBeNull();
  });
});

describe("recentRuns", (): void => {
  it("reads the newest runs first", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => [
      ["bills", FETCHED_AT.toISOString(), FETCHED_AT.toISOString(), "succeeded", 4, null],
    ]);

    const runs = await createIngestStore(db).recentRuns(5);

    expect(runs).toEqual([
      {
        dataset: "bills",
        startedAt: FETCHED_AT,
        finishedAt: FETCHED_AT,
        status: "succeeded",
        recordsWritten: 4,
        error: null,
      },
    ]);
    expect(calls[0]?.sql).toContain('order by "sync_runs"."started_at" desc');
    expect(calls[0]?.params).toEqual([5]);
  });

  /* The parameter has a default so the port's own window applies when a caller doesn't pick one. */
  it("falls back to its own recent-run window", async (): Promise<void> => {
    const { db, calls }: ProxyDatabase = createProxyDatabase((): unknown[][] => []);
    const store: IngestStore = createIngestStore(db);

    // Called through a signature that omits the argument, which is how the default is actually reached.
    await (store.recentRuns as () => Promise<unknown>)();

    const call: ProxyCall | undefined = calls[0];
    expect(call?.params).toEqual([30]);
  });
});

describe("getIngestStore", (): void => {
  it("reports no store when no database is configured", (): void => {
    expect(getIngestStore()).toBeNull();
  });

  it("binds a store once a connection string exists", (): void => {
    process.env.DATABASE_URL = "postgres://ledger:secret@localhost:5432/civic_ledger";

    expect(getIngestStore()).not.toBeNull();
  });
});
