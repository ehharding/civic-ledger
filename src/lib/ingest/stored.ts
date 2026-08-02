import type { CommitteeDirectoryResult } from "@/lib/congress/committee-directory";
import type { CommitteeSummary } from "@/lib/congress/committees";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
  type MemberDirectoryEntry,
} from "@/lib/congress/members";
import {
  type BillRouteParams,
  billIdentityKey,
  type CongressSnapshot,
  compareBillsByRecency,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";
import {
  parseStoredRecord,
  type RecordType,
  type StoredRecord,
  type StoredRecordRow,
  storedRecordPath,
} from "@/lib/ingest/records";
import { getIngestStore, type IngestStore, type SyncRunSummary } from "@/lib/ingest/store";

/**
 * Reading the stored copy, on the terms the rest of the app already expects.
 *
 * Every function here returns `null` — never throws, never an empty-but-successful result — when persistence is
 * unconfigured, unreachable, or simply has nothing on file. That single convention is what lets each caller in the
 * adapter read as one line: try live, then try stored, then fall back to labeled preview data, in that order.
 *
 * **The stored copy is never presented as live.** Everything returned here carries `source: "stored"`, which
 * `DataSourceNotice` renders in its own right — see `docs/data-policy.md`, "The Stored Copy Is a Copy". A page built
 * from these rows is showing real congressional records that this app read at a stated time, which is a different
 * claim from "this is current" and is labeled as the different claim it is.
 */

/**
 * How many stored records one fallback read will load.
 *
 * The bill snapshot is capped at the directory's own page size, since that is all a first paint renders; members and
 * committees are capped generously above their real size (a Congress seats a little over 540 people and has on the
 * order of 250 committee records) so the cap is a runaway guard rather than a silent truncation of a bounded list.
 */
const STORED_BILL_LIMIT: number = DEFAULT_PAGE_SIZE;
const STORED_ROSTER_LIMIT: number = 1_000;

/** How many recent runs the freshness report reads before picking the newest of each dataset. */
const RECENT_RUNS_READ: number = 30;

/**
 * The most stored records the sitemap will enumerate per type.
 *
 * A sitemap file is bounded by the protocol at 50,000 URLs, and a crawler's patience well before that. Bills are the
 * unbounded set of the three, so this cap binds on them and is a real editorial choice: the most recently updated
 * records are the ones a crawler most wants and a reader most likely wants. What it drops is *logged by the sitemap
 * itself* rather than silently omitted — @see src/app/sitemap.ts.
 */
export const SITEMAP_RECORD_LIMIT: number = 5_000;

/** Runs the read, turning any failure into "nothing stored". @see the module note on why nothing here throws. */
async function readStore<Result>(read: (store: IngestStore) => Promise<Result | null>): Promise<Result | null> {
  const store: IngestStore | null = getIngestStore();
  if (!store) return null;

  try {
    return await read(store);
  } catch (error) {
    // Logged, never rendered: a database that is down degrades a page to its next fallback, exactly as an unreachable
    // Congress.gov does. A reader is told the data is preview data, not that a query failed.
    console.error("[ingest] Stored read failed:", error);
    return null;
  }
}

/** Validates a page of rows, dropping any whose payload no longer matches the model. @see parseStoredRecord. */
function usableRecords(rows: StoredRecordRow[]): StoredRecord[] {
  return rows.map(parseStoredRecord).filter((record: StoredRecord | null): record is StoredRecord => record !== null);
}

/**
 * When the copy was last confirmed against upstream.
 *
 * The newest `fetched_at` across the rows being rendered, which is a genuinely different fact from "now" and is the one
 * the disclosure banner should print. A stored page that stamped itself with the current time would be claiming the
 * freshness of the request rather than of the data.
 */
function newestFetchedAt(records: StoredRecord[]): string {
  return new Date(Math.max(...records.map((record: StoredRecord): number => record.fetchedAt.getTime()))).toISOString();
}

/** Reads one type's stored records for a Congress, already validated. `null` when none survive. */
async function loadRecords(recordType: RecordType, congress: number, limit: number): Promise<StoredRecord[] | null> {
  return readStore(async (store: IngestStore): Promise<StoredRecord[] | null> => {
    const records: StoredRecord[] = usableRecords(await store.listRecords({ recordType, congress, limit }));
    return records.length > 0 ? records : null;
  });
}

/**
 * The stored bill snapshot for a Congress, shaped exactly as a live one.
 *
 * Re-sorted by recency here rather than trusted from the query: the store orders by *upstream update time*, which is
 * when a record last changed, while a bill list is presented newest-introduced-first. Those are different orders, and
 * the app has one definition of the latter (@see compareBillsByRecency) that a stored list goes through like any other.
 *
 * @param congress - The Congress to read.
 * @returns The snapshot, or `null` when nothing usable is stored.
 */
export async function getStoredBillSnapshot(congress: number): Promise<CongressSnapshot | null> {
  const records: StoredRecord[] | null = await loadRecords("bill", congress, STORED_BILL_LIMIT);
  if (!records) return null;

  const bills: LegislativeBill[] = records
    .filter((record: StoredRecord): record is Extract<StoredRecord, { recordType: "bill" }> => {
      return record.recordType === "bill";
    })
    .map((record): LegislativeBill => record.payload)
    .sort(compareBillsByRecency);

  if (bills.length === 0) return null;

  return {
    bills,
    source: "stored",
    retrievedAt: newestFetchedAt(records),
    notice: "Congress.gov could not be reached, so records this app stored earlier are shown.",
  };
}

/**
 * One stored bill by its natural identifier.
 *
 * Keyed through {@link billIdentityKey} like every other bill lookup in the app, so a route param and a stored row
 * agree about identity without a third comparison rule.
 *
 * @param input - The bill's route params.
 * @returns The bill and when the copy was last confirmed, or `null` when it isn't stored.
 */
export async function getStoredBill(
  input: BillRouteParams,
): Promise<{ bill: LegislativeBill; retrievedAt: string } | null> {
  return readStore(async (store: IngestStore) => {
    const row: StoredRecordRow | null = await store.findRecord("bill", billIdentityKey(input));
    if (!row) return null;

    const record: StoredRecord | null = parseStoredRecord(row);
    if (record?.recordType !== "bill") return null;

    return { bill: record.payload, retrievedAt: newestFetchedAt([record]) };
  });
}

/**
 * The stored roster, rebuilt into the composition the chamber diagram draws.
 *
 * Grouping and tallying go back through {@link buildChamberComposition} — the same function the live path uses — rather
 * than being recomputed here, so a stored chart and a live one cannot disagree about what a party count or a
 * non-voting-seat split means.
 *
 * @param congress - The Congress to read.
 * @returns The composition, or `null` when either chamber has nothing stored. A half-empty chamber diagram would
 *   assert something false about a seated Congress, which is the same rule the live path applies.
 */
export async function getStoredComposition(congress: number): Promise<CongressComposition | null> {
  const records: StoredRecord[] | null = await loadRecords("member", congress, STORED_ROSTER_LIMIT);
  if (!records) return null;

  const members: MemberDirectoryEntry[] = records
    .filter((record: StoredRecord): record is Extract<StoredRecord, { recordType: "member" }> => {
      return record.recordType === "member";
    })
    .map((record): MemberDirectoryEntry => record.payload);

  const chambers: ChamberComposition[] = congressChambers.map((chamber: CongressChamber): ChamberComposition => {
    const seated: CongressMember[] = members
      .filter((member: MemberDirectoryEntry): boolean => member.chamber === chamber)
      .map(
        ({ bioguideId, name, party, partyName, state, district }: MemberDirectoryEntry): CongressMember => ({
          bioguideId,
          name,
          party,
          partyName,
          state,
          district,
        }),
      );

    return buildChamberComposition(chamber, seated);
  });

  if (chambers.some((chamber: ChamberComposition): boolean => chamber.members.length === 0)) return null;

  return { congress, chambers, source: "stored", retrievedAt: newestFetchedAt(records) };
}

/**
 * The stored committee directory for a Congress.
 *
 * @param congress - The Congress to read.
 * @returns The directory, or `null` when nothing usable is stored.
 */
export async function getStoredCommitteeDirectory(congress: number): Promise<CommitteeDirectoryResult | null> {
  const records: StoredRecord[] | null = await loadRecords("committee", congress, STORED_ROSTER_LIMIT);
  if (!records) return null;

  const committees: CommitteeSummary[] = records
    .filter((record: StoredRecord): record is Extract<StoredRecord, { recordType: "committee" }> => {
      return record.recordType === "committee";
    })
    .map((record): CommitteeSummary => record.payload);

  if (committees.length === 0) return null;

  return {
    congress,
    committees,
    source: "stored",
    retrievedAt: newestFetchedAt(records),
    notice: "Congress.gov could not be reached, so committee records this app stored earlier are shown.",
  };
}

/** What the sitemap enumerates, and how much of the stored set it had to leave out. @see listStoredRecordPaths. */
export type StoredRecordPaths = {
  paths: string[];
  /** How many stored records of each type were dropped by {@link SITEMAP_RECORD_LIMIT}. */
  omitted: number;
};

/**
 * Every in-app path the stored records make crawlable.
 *
 * This is the consumer `docs/architecture.md` named when it kept individual records out of the sitemap: the objection
 * was never that the pages don't deserve listing, it was that enumerating them required a live Congress.gov request and
 * an API key at build time. A local read needs neither, so the objection lapses along with the condition that produced
 * it.
 *
 * @param congress - The Congress whose records to enumerate.
 * @returns The paths and the count omitted by the cap. An unconfigured or empty store yields no paths and no omissions,
 *   which degrades the sitemap to exactly what it listed before ingestion existed.
 */
export async function listStoredRecordPaths(congress: number): Promise<StoredRecordPaths> {
  const perType: (StoredRecord[] | null)[] = await Promise.all([
    loadRecords("bill", congress, SITEMAP_RECORD_LIMIT + 1),
    loadRecords("member", congress, SITEMAP_RECORD_LIMIT + 1),
    loadRecords("committee", congress, SITEMAP_RECORD_LIMIT + 1),
  ]);

  const paths: string[] = [];
  let omitted = 0;

  for (const records of perType) {
    if (!records) continue;

    // One extra row is requested above so "there were more" is an observation rather than an inference from a full
    // page — a count that exactly equals the cap is otherwise indistinguishable from a set that happened to fit.
    omitted += Math.max(0, records.length - SITEMAP_RECORD_LIMIT);
    for (const record of records.slice(0, SITEMAP_RECORD_LIMIT)) paths.push(storedRecordPath(record));
  }

  return { paths, omitted };
}

/** One dataset's freshness, as `/api/health` reports it. */
export type DatasetFreshness = {
  dataset: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  recordsWritten: number;
  /** Present only on a run that did not fully succeed — an operator's field, never rendered to a reader. */
  error: string | null;
};

/**
 * The newest run per dataset.
 *
 * The question worth answering in a health check is not "did the last sync work" but "when did each dataset last
 * succeed", because the failure this table exists to catch is the quiet one: a scheduler that keeps firing against a
 * dataset that has been erroring for a week still looks alive from every other angle.
 *
 * @returns One entry per dataset that has ever run, newest first, or `null` when persistence is unconfigured or
 *   unreachable — which a health check reports as "not configured" rather than as a failure.
 */
export async function getIngestionFreshness(): Promise<DatasetFreshness[] | null> {
  return readStore(async (store: IngestStore): Promise<DatasetFreshness[]> => {
    const seen: Set<string> = new Set<string>();

    return (await store.recentRuns(RECENT_RUNS_READ))
      .filter((run: SyncRunSummary): boolean => {
        if (seen.has(run.dataset)) return false;
        seen.add(run.dataset);
        return true;
      })
      .map(
        (run: SyncRunSummary): DatasetFreshness => ({
          dataset: run.dataset,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          recordsWritten: run.recordsWritten,
          error: run.error,
        }),
      );
  });
}
