import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { type AppDatabase, getDb } from "@/db/client";
import { congressionalRecords, recordEvents, syncRuns } from "@/db/schema";
import type { RecordType, StoredRecordRow } from "@/lib/ingest/records";

/**
 * Every statement this app issues against the ingestion tables, in one module.
 *
 * Two things follow from putting them here rather than beside their callers. The tables have exactly one place that
 * knows their shape, so a column rename is a change to this file instead of a search across the app. And the sync
 * engine can be tested against a store it is handed, rather than against a database it reaches for — which is what
 * makes the interesting logic (watermarks, caps, what counts as written) testable without a Postgres to point at.
 *
 * **Methods here throw.** That is deliberate, and it is the one place in this codebase where it is: a store is the raw
 * port, and the two callers want opposite things from a failure. `sync.ts` needs the error, because recording *why* a
 * run failed is the job of the run it records. `stored.ts` needs it swallowed, because a database hiccup must degrade a
 * page rather than break it. Neither is served by a store that decides for them.
 */

/**
 * The database shape the store needs.
 *
 * Generic over the driver's query-result type rather than pinned to postgres.js, because the tests drive a real Drizzle
 * instance through `drizzle-orm/pg-proxy` — a driver whose transport is a plain function. That is worth the one type
 * parameter: it means the tests exercise the same query builder, the same dialect, and the same generated SQL that
 * production runs, instead of a hand-rolled mock of a fluent interface that would keep passing after the real query
 * stopped being valid.
 */
export type IngestDatabase<TQueryResult extends PgQueryResultHKT = PgQueryResultHKT> = PgDatabase<TQueryResult>;

/** One record about to be written. @see recordPayloadHash for how `payloadHash` is derived. */
export type RecordWrite = {
  recordType: RecordType;
  recordKey: string;
  congress: number;
  title: string;
  payload: unknown;
  sourceUpdatedAt: Date | null;
  fetchedAt: Date;
  payloadHash: string;
  providerUrl: string;
};

/** One observed action about to be appended. @see eventHashFor. */
export type EventWrite = {
  recordType: RecordType;
  recordKey: string;
  occurredOn?: string;
  summary: string;
  eventHash: string;
};

/** How a sync run ended. `"partial"` is a run that wrote real records and also hit something it could not read. */
export const syncStatuses = ["succeeded", "partial", "failed"] as const;

export type SyncStatus = (typeof syncStatuses)[number];

/** One completed run, as it is written to `sync_runs`. */
export type SyncRunWrite = {
  dataset: string;
  startedAt: Date;
  finishedAt: Date;
  status: SyncStatus;
  watermark: Date | null;
  nextWatermark: Date | null;
  recordsSeen: number;
  recordsWritten: number;
  eventsAppended: number;
  requestsMade: number;
  error: string | null;
};

/** One run as it is read back for the freshness report. */
export type SyncRunSummary = {
  dataset: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  recordsWritten: number;
  error: string | null;
};

/** The port the sync engine and the read helpers are both written against. @see createIngestStore. */
export type IngestStore = {
  latestWatermark(recordType: RecordType, congress: number): Promise<Date | null>;
  upsertRecords(records: RecordWrite[]): Promise<number>;
  appendEvents(events: EventWrite[]): Promise<number>;
  recordRun(run: SyncRunWrite): Promise<void>;
  listRecords(input: { recordType: RecordType; congress: number; limit: number }): Promise<StoredRecordRow[]>;
  findRecord(recordType: RecordType, recordKey: string): Promise<StoredRecordRow | null>;
  recentRuns(limit: number): Promise<SyncRunSummary[]>;
};

/**
 * How many runs {@link IngestStore.recentRuns} reads to find the newest per dataset.
 *
 * The freshness report wants one row per dataset, which SQL can express with `DISTINCT ON` — a Postgres-specific
 * construct this app would then be the only user of. Reading a small recent window and picking the first of each in
 * JavaScript is the same answer for a table that gains three rows per scheduled run, and keeps the query ordinary.
 */
const RECENT_RUN_WINDOW: number = 30;

/**
 * Binds the statements above to a database handle.
 *
 * @param db - Any Drizzle Postgres handle. @see IngestDatabase for why this is generic.
 * @returns The store. Every method issues one statement and propagates a driver error to its caller.
 */
export function createIngestStore<TQueryResult extends PgQueryResultHKT>(
  db: IngestDatabase<TQueryResult>,
): IngestStore {
  return {
    /**
     * The newest upstream timestamp already stored for a dataset — where the next incremental fetch starts.
     *
     * Derived from the records themselves rather than read off the last run, so a run that succeeded but wrote nothing,
     * or a row inserted by a backfill, cannot leave the cursor claiming coverage the records don't have.
     *
     * Written as a top-1 ordered read rather than the `max()` it reads like, for two reasons. It walks the
     * `(record_type, congress, source_updated_at)` index straight to its edge instead of aggregating, and — the part
     * that actually bit — the value comes back through the column's own codec. A raw `max()` is untyped SQL, so what it
     * yields is whatever the driver happens to hand back: postgres.js parses a `timestamptz` into a `Date` and other
     * drivers return the string, which makes a `Promise<Date | null>` signature true only by luck of the driver.
     *
     * @returns The newest `source_updated_at`, or `null` when nothing is stored yet — which the caller reads as "no
     *   window", i.e. a first, unwindowed fetch.
     */
    async latestWatermark(recordType: RecordType, congress: number): Promise<Date | null> {
      const rows: { value: Date | null }[] = await db
        .select({ value: congressionalRecords.sourceUpdatedAt })
        .from(congressionalRecords)
        .where(and(eq(congressionalRecords.recordType, recordType), eq(congressionalRecords.congress, congress)))
        .orderBy(sql`${congressionalRecords.sourceUpdatedAt} desc nulls last`)
        .limit(1);

      return rows[0]?.value ?? null;
    },

    /**
     * Writes records, updating only the ones that actually changed.
     *
     * The `setWhere` clause is the substance: a row whose payload hash already matches is left entirely alone, so
     * `fetched_at` still says when this app last saw a *change* rather than when it last ran a query. That distinction
     * is what makes the stored copy's own freshness claim meaningful — a timestamp bumped by every no-op sync reports
     * nothing except that the scheduler is alive.
     *
     * @returns How many rows were inserted or updated, counted from `RETURNING` rather than from the input length,
     *   which is what makes "records written" in a sync run a real number instead of a restatement of "records seen".
     */
    async upsertRecords(records: RecordWrite[]): Promise<number> {
      if (records.length === 0) return 0;

      const written: { recordKey: string }[] = await db
        .insert(congressionalRecords)
        .values(records)
        .onConflictDoUpdate({
          target: [congressionalRecords.recordType, congressionalRecords.recordKey],
          set: {
            congress: sql`excluded.congress`,
            title: sql`excluded.title`,
            payload: sql`excluded.payload`,
            sourceUpdatedAt: sql`excluded.source_updated_at`,
            fetchedAt: sql`excluded.fetched_at`,
            payloadHash: sql`excluded.payload_hash`,
            providerUrl: sql`excluded.provider_url`,
          },
          setWhere: sql`${congressionalRecords.payloadHash} <> excluded.payload_hash`,
        })
        .returning({ recordKey: congressionalRecords.recordKey });

      return written.length;
    },

    /**
     * Appends observed actions, ignoring any already on file.
     *
     * Idempotence is a unique index on the event hash rather than a read-then-write check, so two syncs overlapping in
     * time cannot both decide an action is new and insert it twice.
     *
     * @returns How many were genuinely new.
     */
    async appendEvents(events: EventWrite[]): Promise<number> {
      if (events.length === 0) return 0;

      const appended: { id: string }[] = await db
        .insert(recordEvents)
        .values(events)
        .onConflictDoNothing({ target: recordEvents.eventHash })
        .returning({ id: recordEvents.id });

      return appended.length;
    },

    /**
     * Records how a run went, including a failed one. @see syncRuns for why a failure is written rather than dropped.
     */
    async recordRun(run: SyncRunWrite): Promise<void> {
      await db.insert(syncRuns).values(run);
    },

    /**
     * The stored records of one type in one Congress, most recently updated first.
     *
     * `nulls last` is explicit rather than left to the default: Postgres sorts nulls first under `DESC`, which would
     * put every record whose endpoint publishes no update timestamp ahead of every record that has one — exactly
     * backwards for a list whose whole ordering claim is recency.
     */
    async listRecords(input: { recordType: RecordType; congress: number; limit: number }): Promise<StoredRecordRow[]> {
      return db
        .select()
        .from(congressionalRecords)
        .where(
          and(eq(congressionalRecords.recordType, input.recordType), eq(congressionalRecords.congress, input.congress)),
        )
        .orderBy(sql`${congressionalRecords.sourceUpdatedAt} desc nulls last`)
        .limit(input.limit);
    },

    /** One record by its natural key, or `null` when nothing is stored under it. */
    async findRecord(recordType: RecordType, recordKey: string): Promise<StoredRecordRow | null> {
      const rows: {
        recordType: string;
        recordKey: string;
        congress: number;
        title: string;
        payload: unknown;
        sourceUpdatedAt: Date | null;
        fetchedAt: Date;
        payloadHash: string;
        providerUrl: string;
      }[] = await db
        .select()
        .from(congressionalRecords)
        .where(and(eq(congressionalRecords.recordType, recordType), eq(congressionalRecords.recordKey, recordKey)))
        .limit(1);

      return rows[0] ?? null;
    },

    /** The most recent runs across all datasets, newest first. @see RECENT_RUN_WINDOW for why the window is small. */
    async recentRuns(limit: number = RECENT_RUN_WINDOW): Promise<SyncRunSummary[]> {
      return db
        .select({
          dataset: syncRuns.dataset,
          startedAt: syncRuns.startedAt,
          finishedAt: syncRuns.finishedAt,
          status: syncRuns.status,
          recordsWritten: syncRuns.recordsWritten,
          error: syncRuns.error,
        })
        .from(syncRuns)
        .orderBy(desc(syncRuns.startedAt))
        .limit(limit);
    },
  };
}

/**
 * The store bound to this app's own connection, or `null` when no database is configured.
 *
 * The one place production code turns "is persistence available?" into a store, so every caller answers that question
 * the same way — and so the answer stays `null` rather than an exception on the deployment target that structurally
 * cannot have a database.
 */
export function getIngestStore(): IngestStore | null {
  const db: AppDatabase | null = getDb();
  return db ? createIngestStore(db) : null;
}
