import { getCurrentCongress } from "@/lib/congress/current-congress";
import { type DatasetHarvest, type IngestDataset, ingestDatasets } from "@/lib/ingest/datasets";
import type { IngestStore, RecordWrite, SyncRunWrite, SyncStatus } from "@/lib/ingest/store";

/**
 * One scheduled pass over every dataset.
 *
 * The whole engine is here, and it is deliberately small: read a watermark, ask the dataset what changed, write what
 * came back, record what happened. Everything that could make it larger — how to reach Congress.gov, what a record is,
 * what SQL to issue — belongs to a module this one calls.
 *
 * Three properties hold for every run, and the tests pin all three:
 *
 * 1. **Nothing throws.** A dataset that fails is recorded as a failed run and the next dataset still runs. One
 *    unreachable endpoint must not cost the other two their refresh.
 * 2. **A failure is written down.** A sync that logs an error and writes no row reports perfect freshness right up
 *    until somebody notices the data is a month old.
 * 3. **The watermark only advances over records actually stored.** It is derived from what this run wrote, not from
 *    when the run happened, so a run that read nothing leaves the cursor where it was rather than stepping over the
 *    window it failed to read.
 */

/** What one dataset's run did, as the route reports it back to the caller. */
export type SyncResult = {
  dataset: string;
  status: SyncStatus;
  recordsSeen: number;
  recordsWritten: number;
  eventsAppended: number;
  requestsMade: number;
  /** Present only on a `"failed"` or `"partial"` run. An operator's field; no reader-facing surface renders it. */
  error?: string;
};

/**
 * The newest upstream timestamp among the records this run is about to write.
 *
 * @param records - The run's writes.
 * @returns The newest `sourceUpdatedAt`, or `null` when none of them carries one — which is the normal case for the two
 *   unwindowed datasets and correctly leaves their cursor unset.
 */
function nextWatermark(records: RecordWrite[]): Date | null {
  const stamps: number[] = records
    .map((record: RecordWrite): Date | null => record.sourceUpdatedAt)
    .filter((value: Date | null): value is Date => value !== null)
    .map((value: Date): number => value.getTime());

  return stamps.length > 0 ? new Date(Math.max(...stamps)) : null;
}

/** The message form of whatever was thrown, since a `catch` binding is `unknown` and may not be an `Error`. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one dataset and records the outcome.
 *
 * @param input - The dataset, the store to write through, the key, the Congress, and this run's clock.
 * @returns The run's summary. Never throws — a thrown error becomes a recorded `"failed"` run.
 */
async function runDataset(input: {
  dataset: IngestDataset;
  store: IngestStore;
  apiKey: string;
  congress: number;
  now: Date;
}): Promise<SyncResult> {
  const { dataset, store, apiKey, congress, now } = input;
  const startedAt: Date = now;
  let watermark: Date | null = null;

  try {
    watermark = dataset.windowed ? await store.latestWatermark(dataset.recordType, congress) : null;

    const harvest: DatasetHarvest = await dataset.collect({ apiKey, congress, since: watermark, now });
    const recordsWritten: number = await store.upsertRecords(harvest.records);
    const eventsAppended: number = await store.appendEvents(harvest.events);
    const status: SyncStatus = harvest.complete ? "succeeded" : "partial";

    const run: SyncRunWrite = {
      dataset: dataset.name,
      startedAt,
      finishedAt: new Date(),
      status,
      watermark,
      nextWatermark: nextWatermark(harvest.records),
      recordsSeen: harvest.records.length,
      recordsWritten,
      eventsAppended,
      requestsMade: harvest.requests,
      error: harvest.complete ? null : "Upstream window was not read to completion.",
    };
    await store.recordRun(run);

    return {
      dataset: dataset.name,
      status,
      recordsSeen: run.recordsSeen,
      recordsWritten,
      eventsAppended,
      requestsMade: run.requestsMade,
      ...(run.error ? { error: run.error } : {}),
    };
  } catch (error) {
    const message: string = describeError(error);
    console.error(`[ingest] ${dataset.name} sync failed:`, error);

    // Best-effort: if the database is what failed, this write fails too, and the thrown error has nowhere useful to go
    // — the caller already gets the failure in the returned result.
    await store
      .recordRun({
        dataset: dataset.name,
        startedAt,
        finishedAt: new Date(),
        status: "failed",
        watermark,
        nextWatermark: null,
        recordsSeen: 0,
        recordsWritten: 0,
        eventsAppended: 0,
        requestsMade: 0,
        error: message,
      })
      .catch((writeError: unknown): void => {
        console.error("[ingest] Could not record the failed run:", writeError);
      });

    return {
      dataset: dataset.name,
      status: "failed",
      recordsSeen: 0,
      recordsWritten: 0,
      eventsAppended: 0,
      requestsMade: 0,
      error: message,
    };
  }
}

/**
 * Runs every dataset, in order.
 *
 * Sequential rather than concurrent, deliberately. The datasets share one Congress.gov quota and one small connection
 * pool, and a scheduled job has no reader waiting on it — so there is nothing to buy with parallelism except a burst of
 * simultaneous load against both.
 *
 * @param input - The store to write through, the Congress.gov key, and optionally the Congress, the clock, and the
 *   datasets to run. The last three are injectable so the tests can pin a run rather than depend on today's date.
 * @returns One result per dataset, in run order.
 */
export async function runIngestion(input: {
  store: IngestStore;
  apiKey: string;
  congress?: number;
  now?: Date;
  datasets?: readonly IngestDataset[];
}): Promise<SyncResult[]> {
  const congress: number = input.congress ?? getCurrentCongress();
  const now: Date = input.now ?? new Date();
  const datasets: readonly IngestDataset[] = input.datasets ?? ingestDatasets;
  const results: SyncResult[] = [];

  for (const dataset of datasets) {
    results.push(await runDataset({ dataset, store: input.store, apiKey: input.apiKey, congress, now }));
  }

  return results;
}
