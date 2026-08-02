import {
  type CongressApiBill,
  type CongressApiListResponse,
  congressApiListResponseSchema,
} from "@/lib/congress/api-schema";
import {
  BILL_LIST_CACHE_TAG,
  buildCongressUrl,
  type CongressRequestResult,
  MAX_API_PAGE_SIZE,
  requestCongressJson,
} from "@/lib/congress/http";
import { mapCongressBill } from "@/lib/congress/mappers";
import type { LegislativeBill } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/**
 * The reads the scheduled sync makes, and only those.
 *
 * This module exists because ingestion needs something the rest of the adapter deliberately doesn't offer: an
 * **unwrapped, live-only** read. Every other exported read falls back — to the store, then to labeled preview data —
 * which is exactly right for a page and exactly wrong for a sync. A sync that ingested its own fallback would write the
 * copy back over itself, stamping a fresh `fetched_at` on records nobody re-read; a sync that ingested preview fixtures
 * would file fiction under a live provenance. So the fetchers here return `null` where a page-facing read would return
 * a labeled substitute, and the caller records a failed run.
 *
 * @see src/lib/ingest/datasets.ts, the only consumer.
 */

/** Hard ceiling on pages fetched for one dataset in one run, so a bad cursor can't turn a sync into a full mirror. */
export const MAX_INGEST_PAGES: number = 8;

/**
 * How far back a windowed fetch reaches beyond the stored watermark, in milliseconds.
 *
 * Congress.gov publishes `updateDate` to the second, and `fromDateTime` is inclusive of the boundary — but a record
 * updated in the same second as the previous run's newest one can still be published after that run read its page. An
 * exact resumption would step over it and never look back, because the watermark would already have moved past. Five
 * minutes of deliberate re-reading costs a handful of no-op upserts (the payload hash makes an unchanged record a
 * no-write) and closes the gap.
 */
const WATERMARK_OVERLAP_MS: number = 5 * 60 * 1000;

/** One bill as ingestion sees it: the app's normalized model, plus the upstream timestamp the model doesn't carry. */
export type UpdatedBill = {
  bill: LegislativeBill;
  /** Congress.gov's own `updateDate`, or `null` when the record carries none or an unparseable one. */
  sourceUpdatedAt: Date | null;
};

/** What one windowed sweep found. @see fetchBillsUpdatedSince. */
export type UpdatedBillSweep = {
  bills: UpdatedBill[];
  /** How many upstream requests this cost, for the run's quota accounting. */
  requests: number;
  /**
   * Whether the sweep reached the end of the window. `false` means a page failed or the per-run cap was hit, so the
   * watermark should still advance (what was read is real) but the run is recorded as partial rather than complete.
   */
  complete: boolean;
};

/**
 * Formats a `Date` for Congress.gov's `fromDateTime` parameter, which takes whole seconds in UTC
 * (`2025-07-14T09:30:00Z`) and rejects the fractional seconds `toISOString` emits.
 */
export function toApiDateTime(value: Date): string {
  return `${value.toISOString().slice(0, 19)}Z`;
}

/**
 * Parses an upstream timestamp.
 *
 * @param value - The raw `updateDate`, if any.
 * @returns The parsed date, or `null` for an absent or unparseable one — which is stored as a genuine "no upstream
 *   timestamp" rather than silently becoming the time this app happened to read the record.
 */
export function parseSourceTimestamp(value?: string): Date | null {
  if (!value) return null;

  const parsed: Date = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Fetches one page of a Congress's bills, ordered oldest-update-first and optionally windowed.
 *
 * @param input - The key, the Congress, the page window, and the inclusive lower bound on `updateDate`.
 * @returns The raw page, or `null` on any failure.
 */
async function fetchUpdatedPage(input: {
  apiKey: string;
  congress: number;
  offset: number;
  fromDateTime?: string;
}): Promise<CongressApiListResponse | null> {
  const url: URL = buildCongressUrl(`/bill/${input.congress}`, input.apiKey, {
    limit: String(MAX_API_PAGE_SIZE),
    offset: String(input.offset),
    // Ascending, which is what makes paging safe here. Under `updateDate+desc` a record updated mid-sweep is inserted
    // at the front, shifting every later offset by one and skipping whatever fell across the boundary. Ascending puts
    // new activity after the window being read, where it is simply picked up by the next run.
    sort: "updateDate+asc",
    ...(input.fromDateTime ? { fromDateTime: input.fromDateTime } : {}),
  });

  const result: CongressRequestResult<CongressApiListResponse> = await requestCongressJson(
    url,
    [BILL_LIST_CACHE_TAG],
    congressApiListResponseSchema,
    `ingest sweep at offset ${input.offset} for the ${formatOrdinal(input.congress)} Congress`,
    "fresh",
  );

  return result.outcome === "ok" ? result.data : null;
}

/**
 * Sweeps every bill of one Congress updated since `since`, up to a bounded number of records.
 *
 * This is the incremental half of ingestion. On a first run `since` is `null` and the sweep reads the most recently
 * updated slice of the Congress from the beginning; on every run after that it reads only what moved, which is what
 * keeps a scheduled sync cheap enough to run often without approaching the API's hourly quota.
 *
 * @param input - The key, the Congress to sweep, the stored watermark (or `null`), and the per-run record cap.
 * @returns Everything found, with the request count and whether the window was exhausted. Never throws.
 */
export async function fetchBillsUpdatedSince(input: {
  apiKey: string;
  congress: number;
  since: Date | null;
  maxRecords: number;
}): Promise<UpdatedBillSweep> {
  const fromDateTime: string | undefined = input.since
    ? toApiDateTime(new Date(input.since.getTime() - WATERMARK_OVERLAP_MS))
    : undefined;

  const bills: UpdatedBill[] = [];
  let requests = 0;

  for (let page = 0; page < MAX_INGEST_PAGES; page += 1) {
    const payload: CongressApiListResponse | null = await fetchUpdatedPage({
      apiKey: input.apiKey,
      congress: input.congress,
      offset: page * MAX_API_PAGE_SIZE,
      fromDateTime,
    });
    requests += 1;

    if (!payload) return { bills, requests, complete: false };

    const raw: CongressApiBill[] = payload.bills ?? [];

    for (const record of raw) {
      const bill: LegislativeBill | null = mapCongressBill(record);
      if (bill) bills.push({ bill, sourceUpdatedAt: parseSourceTimestamp(record.updateDate) });
    }

    // A short page is the end of the window; a full one that reached the cap is the end of what this run will take.
    if (raw.length < MAX_API_PAGE_SIZE) return { bills, requests, complete: true };
    if (bills.length >= input.maxRecords) return { bills, requests, complete: false };
  }

  return { bills, requests, complete: false };
}
