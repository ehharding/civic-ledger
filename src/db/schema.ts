import {
  type ExtraConfigColumn,
  type ForeignKeyBuilder,
  foreignKey,
  type IndexBuilder,
  index,
  integer,
  jsonb,
  type PrimaryKeyBuilder,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The app's persistence schema, in two parts that are kept deliberately separate.
 *
 * **User-owned data** ({@link users}, {@link savedBills}) is what Congress.gov has no opinion about: which person saved
 * which bill. Nothing upstream can produce or contradict it.
 *
 * **Ingested records** ({@link congressionalRecords}, {@link recordEvents}, {@link syncRuns}) are this app's own
 * normalized *copy* of records Congress.gov publishes. A copy is not a source of truth, and the columns are shaped so
 * that distinction can be kept honestly rather than merely asserted: every row carries when upstream last changed it
 * (`source_updated_at`), when this app read it (`fetched_at`), a hash of the normalized payload, and the provider URL a
 * reader can check it against. Anything rendered from these rows is labeled as stored rather than live — see
 * `docs/data-policy.md`, "The Stored Copy Is a Copy".
 *
 * @see docs/architecture.md's "Normalized Ingestion" for what the sync job does with these tables.
 */

/** A registered person. The only identity this app stores, and the owner of every row in {@link savedBills}. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A user's saved bills.
 *
 * Composite-keyed on the user plus the bill's natural identifier (congress + type + number) rather than a surrogate id.
 * That identifier is already unique and stable under Congress.gov's own scheme, so a surrogate key would add a column
 * without adding a guarantee — and the composite key gives "a user can't save the same bill twice" for free, as a
 * database constraint rather than as application logic that has to remember to check.
 *
 * The secondary index covers the query this table exists to serve: every bill one user saved, newest first.
 */
export const savedBills = pgTable(
  "saved_bills",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stored as text, matching `BillRouteParams` — these are identifiers, never operands for arithmetic. */
    congress: text("congress").notNull(),
    billType: text("bill_type").notNull(),
    billNumber: text("bill_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table: {
    userId: ExtraConfigColumn;
    congress: ExtraConfigColumn;
    billType: ExtraConfigColumn;
    billNumber: ExtraConfigColumn;
    createdAt: ExtraConfigColumn;
  }): (PrimaryKeyBuilder | IndexBuilder)[] => [
    primaryKey({ columns: [table.userId, table.congress, table.billType, table.billNumber] }),
    index("saved_bills_user_created_idx").on(table.userId, table.createdAt),
  ],
);

/**
 * One congressional record — a bill, a member, or a committee — as this app normalized it.
 *
 * Composite-keyed on `(record_type, record_key)`, both of which are Congress.gov's own identifiers rather than anything
 * this app invented: `"119-HR-284"`, `"L000174"`, `"house-hsag00"`. A surrogate id would add a column that guarantees
 * nothing the natural key doesn't already, and would let the same record be ingested twice under two ids.
 *
 * `payload` holds the app's *normalized* model (`LegislativeBill`, `MemberDirectoryEntry`, `CommitteeSummary`), not the
 * upstream response. Storing the wire shape would mean every read re-ran the mappers and every mapper change silently
 * reinterpreted history; storing the model means a stored record and a live one are the same shape by construction.
 * It is still validated on the way out — see `parseStoredPayload` in `src/lib/ingest/records.ts` — because a row can be
 * written by an older version of this app or edited by hand, which makes it untrusted input on exactly the same
 * reasoning that makes an upstream payload untrusted.
 *
 * The four provenance columns are the point of the table rather than bookkeeping on it. A stored record that cannot say
 * when upstream last changed, when this app last looked, or where a reader can check it is a claim with nothing behind
 * it.
 */
export const congressionalRecords = pgTable(
  "congressional_records",
  {
    /**
     * `"bill"`, `"member"`, or `"committee"` — @see `recordTypes` in `src/lib/ingest/records.ts`, which owns the list.
     */
    recordType: text("record_type").notNull(),
    /** Congress.gov's own identifier for the record, normalized by `recordKeyFor`. */
    recordKey: text("record_key").notNull(),
    /** The Congress this record was read under. Members and committees are published per-Congress, as bills are. */
    congress: integer("congress").notNull(),
    /** The record's display name, duplicated out of the payload so a listing query needs no JSON extraction. */
    title: text("title").notNull(),
    /** The normalized model. Untyped here deliberately: validation belongs at the read boundary, not in a table. */
    payload: jsonb("payload").notNull(),
    /**
     * When Congress.gov last changed this record, as it reports it. Nullable because not every endpoint publishes one —
     * a record with no upstream timestamp is stored honestly as having none rather than being stamped with the time
     * this app happened to read it, which would be this app's fact wearing upstream's name.
     */
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    /** When this app read the record. Always known, because this app is the one doing the reading. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    /** SHA-256 of the normalized payload, so an unchanged record is recognizable without diffing JSON. */
    payloadHash: text("payload_hash").notNull(),
    /**
     * The public Congress.gov page for this record — the link that lets a reader check the copy against the original.
     */
    providerUrl: text("provider_url").notNull(),
  },
  (table): (PrimaryKeyBuilder | IndexBuilder)[] => [
    primaryKey({ columns: [table.recordType, table.recordKey] }),
    // Covers the two queries this table exists to serve: "the most recently updated records of one type in one
    // Congress" (the stored fallback) and "every record of one type in one Congress" (the sitemap).
    index("congressional_records_type_congress_idx").on(table.recordType, table.congress, table.sourceUpdatedAt),
  ],
);

/**
 * An append-only log of the actions this app has *observed* on a record.
 *
 * The honesty constraint is in that word. Congress.gov's list endpoints publish one `latestAction` per record, so each
 * sync can append at most the newest action it saw; a bill's complete action history lives behind the `/actions`
 * sub-resource this app deliberately does not sweep, because sweeping it for every bill is the mirroring
 * `docs/roadmap.md` rules out. What accumulates here is therefore a record of what changed while this app was watching,
 * which is exactly what a future notification needs and is not a legislative history. Nothing renders it as one — see
 * `docs/data-policy.md`, "Observed Events Are Not a Legislative History".
 *
 * `event_hash` is what makes an append idempotent: re-observing an action a hundred syncs running inserts it once, so
 * "did we already see this?" is a unique constraint rather than a read-then-write race.
 */
export const recordEvents = pgTable(
  "record_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recordType: text("record_type").notNull(),
    recordKey: text("record_key").notNull(),
    /** The date Congress.gov attributes the action to, as published (`"2025-07-14"`). Absent on some records. */
    occurredOn: text("occurred_on"),
    /** The action text, verbatim. Never rewritten — an action's wording is the record. */
    summary: text("summary").notNull(),
    /** SHA-256 over the record, the date, and the text. @see eventHashFor. */
    eventHash: text("event_hash").notNull(),
    /** When this app first saw the action, which is not when the action happened. */
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table): (ForeignKeyBuilder | IndexBuilder)[] => [
    foreignKey({
      columns: [table.recordType, table.recordKey],
      foreignColumns: [congressionalRecords.recordType, congressionalRecords.recordKey],
    }).onDelete("cascade"),
    uniqueIndex("record_events_hash_idx").on(table.eventHash),
    index("record_events_record_idx").on(table.recordType, table.recordKey, table.occurredOn),
  ],
);

/**
 * One run of the scheduled sync, per dataset.
 *
 * This is the observability half of ingestion, and it is a table rather than a log line because the two questions it
 * answers are both historical: "how fresh is what we are serving?" (the newest successful run) and "has this been
 * quietly failing?" (the runs since). A log line answers neither once it has rotated away.
 *
 * A failed run is recorded, not discarded. A sync that never writes a row when it breaks is a sync that reports perfect
 * health right up until someone notices the data is a month old.
 */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Which dataset this run covered — @see `ingestDatasets` in `src/lib/ingest/datasets.ts`. */
    dataset: text("dataset").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** `"succeeded"`, `"partial"`, or `"failed"` — @see `SyncStatus`, which owns the list. */
    status: text("status").notNull(),
    /** The `updatedSince` cursor this run asked upstream for, so a run's scope is recoverable after the fact. */
    watermark: timestamp("watermark", { withTimezone: true }),
    /** The newest `source_updated_at` this run saw, which becomes the next run's cursor. */
    nextWatermark: timestamp("next_watermark", { withTimezone: true }),
    recordsSeen: integer("records_seen").default(0).notNull(),
    recordsWritten: integer("records_written").default(0).notNull(),
    eventsAppended: integer("events_appended").default(0).notNull(),
    requestsMade: integer("requests_made").default(0).notNull(),
    /** Why a run ended `"failed"` or `"partial"`. Never rendered to a reader; this is an operator's field. */
    error: text("error"),
  },
  // Covers the freshness query: the newest run for one dataset.
  (table): IndexBuilder[] => [index("sync_runs_dataset_started_idx").on(table.dataset, table.startedAt)],
);
