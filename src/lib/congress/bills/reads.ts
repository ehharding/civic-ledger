import { cache } from "react";

import type { BillSearchResponse } from "@/lib/api-contract";
import {
  type BillAction,
  type BillRouteParams,
  type BillSummary,
  type BillTextVersion,
  billIdentityKey,
  type CongressSnapshot,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/bills/model";
import { sanitizeSummaryHtml } from "@/lib/congress/bills/sanitize-summary";
import { matchesQuery, type ParsedBillCitation, parseBillCitation } from "@/lib/congress/bills/search";
import { type BillSubResource, fetchBillSubResource, requestBillDetail } from "@/lib/congress/bills/sub-resource";
import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import {
  type CongressApiAction,
  type CongressApiActionsResponse,
  type CongressApiDetailResponse,
  type CongressApiListResponse,
  type CongressApiSummariesResponse,
  type CongressApiSummary,
  type CongressApiTextResponse,
  type CongressApiTextVersion,
  congressApiActionsResponseSchema,
  congressApiListResponseSchema,
  congressApiSummariesResponseSchema,
  congressApiTextResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { previewBills, previewSummaries } from "@/lib/congress/upstream/fixtures";
import {
  BILL_LIST_CACHE_TAG,
  billPageCacheWindow,
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  requestCongressJson,
  revalidateSecondsForCongress,
} from "@/lib/congress/upstream/http";
import {
  mapCongressAction,
  mapCongressBill,
  mapCongressSummary,
  mapCongressTextVersion,
  mapUsable,
} from "@/lib/congress/upstream/mappers";
import { compareIsoDatesDesc, formatOrdinal } from "@/lib/format";

/**
 * Everything this app reads about *bills*: list snapshots, pagination, single-bill lookup, sub-resources, and
 * cross-Congress search. Every export holds two invariants:
 *
 * 1. **Nothing throws.** Upstream failure degrades to labeled preview data, never an error boundary.
 * 2. **Provenance travels with the data**, so no caller can render preview data as live.
 *
 * @see upstream/http.ts for the transport and caching policy these functions share.
 * @see upstream/mappers.ts for the upstream-to-internal translation they all run their results through.
 */

/**
 * The bill list endpoint's "most recently touched first" order.
 *
 * **The separator is a space.** The docs' `updateDate+desc` is the URL-encoded form; passing it as a value sends `%2B`,
 * which the API silently ignores, returning an unsorted page. Spelled once here and pinned by the `sort` assertions in
 * `reads.test.ts`.
 *
 * `updateDate` (the only sortable field) is when Congress.gov last touched the row, not legislative activity, so the
 * home page re-sorts.
 *
 * @see compareBillsByActivity
 */
const RECENTLY_UPDATED_FIRST: string = "updateDate desc";

/** Max bills fetched per Congress when sweeping for a search — the API's own per-request ceiling. */
const SEARCH_PAGE_LIMIT: number = MAX_API_PAGE_SIZE;

/** Max bills returned from a single search, across every Congress swept together. */
const MAX_SEARCH_RESULTS: number = 60;

/**
 * Locates a matching fixture in `previewBills` by natural bill identifier.
 *
 * @param input - The bill's route params.
 * @returns The matching preview fixture, or `undefined` when none covers that bill.
 */
function findPreviewBill(input: BillRouteParams): LegislativeBill | undefined {
  const key: string = billIdentityKey(input);
  return previewBills.find((bill: LegislativeBill): boolean => billIdentityKey(bill) === key);
}

/**
 * Every preview fixture belonging to one Congress. A bill from another Congress is not a preview of this one.
 *
 * @param congress - The Congress to read.
 * @returns That Congress's fixtures, possibly none.
 */
function previewBillsForCongress(congress: number): LegislativeBill[] {
  return previewBills.filter((bill: LegislativeBill): boolean => bill.congress === congress);
}

/**
 * Fetches one page of the bill list for a specific Congress, filtered by path. The unfiltered `/v3/bill` list mixes
 * bills from every Congress.
 *
 * @param input - The API key, the Congress to read, the page window, and the Congress.gov sort to request.
 *
 *   `sort` is required because `/v3/bill/{congress}` defaults to *ascending* latest-action order — a Congress's least
 *   active bills — and every surface in this app leads with what is current. Callers pass
 *   {@link RECENTLY_UPDATED_FIRST}.
 * @returns The mapped bills, or `null` on any failure — so callers can choose their own fallback (preview data for a
 *   page render, an empty page for "Load More").
 */
async function fetchBillsPage(input: {
  apiKey: string;
  offset: number;
  limit: number;
  congress: number;
  sort: string;
}): Promise<LegislativeBill[] | null> {
  const url: URL = buildCongressUrl(`/bill/${input.congress}`, input.apiKey, {
    limit: String(input.limit),
    offset: String(input.offset),
    sort: input.sort,
  });

  const result: CongressRequestResult<CongressApiListResponse> = await requestCongressJson(
    url,
    [BILL_LIST_CACHE_TAG],
    congressApiListResponseSchema,
    `bill list for the ${formatOrdinal(input.congress)} Congress`,
    revalidateSecondsForCongress(input.congress),
  );

  if (result.outcome !== "ok") return null;

  return mapUsable(result.data.bills, mapCongressBill);
}

/**
 * Fetches the first page of a specific Congress's bills — the implementation behind both {@link getCongressSnapshot}
 * and `/bills/[congress]`.
 *
 * Falls back to preview fixtures when there's no key or the request fails or is empty. The fallback is scoped to the
 * requested Congress, so one without fixtures reports an empty, labeled result rather than borrowing bills.
 *
 * @param congress - The Congress to read (e.g., `119`).
 * @returns A snapshot that always states its own provenance. Read `source` rather than assuming success; this never
 *   throws.
 */
export async function getCongressSnapshotForCongress(congress: number): Promise<CongressSnapshot> {
  const apiKey: string | undefined = getCongressApiKey();
  const retrievedAt: string = new Date().toISOString();
  const previewForCongress: LegislativeBill[] = previewBillsForCongress(congress);

  if (!apiKey) {
    return {
      bills: previewForCongress,
      source: "preview",
      retrievedAt,
      notice:
        previewForCongress.length > 0
          ? "Preview records are shown until a server-only Congress.gov API key is configured."
          : `No preview records are available for the ${formatOrdinal(congress)} Congress. Configure a server-only Congress.gov API key to browse its live records.`,
    };
  }

  const bills: LegislativeBill[] | null = await fetchBillsPage({
    apiKey,
    offset: 0,
    limit: DEFAULT_PAGE_SIZE,
    congress,
    sort: RECENTLY_UPDATED_FIRST,
  });

  if (!bills || bills.length === 0) {
    return {
      bills: previewForCongress,
      source: "preview",
      retrievedAt,
      notice: "Live records are temporarily unavailable, so preview records are shown.",
    };
  }

  return { bills, source: "live", retrievedAt };
}

/**
 * Fetches the first page of the *current* Congress's bills, for the homepage and the default `/bills` directory.
 *
 * @returns The current Congress's snapshot — a thin wrapper around {@link getCongressSnapshotForCongress}, which owns
 *   the actual fetch and fallback behavior.
 */
export async function getCongressSnapshot(): Promise<CongressSnapshot> {
  return getCongressSnapshotForCongress(getCurrentCongress());
}

/**
 * Fetches an additional page of live bills for the directory's "Load More" control.
 *
 * @param offset - How many bills the client already has; becomes the upstream `offset`.
 * @param congress - Which Congress to page through. Defaults to the current one, so single-argument callers are
 *   unaffected.
 * @returns The next page, or an empty array when no key is configured or the request fails, so the UI stops offering
 *   more.
 */
export async function getMoreBills(
  offset: number,
  congress: number = getCurrentCongress(),
): Promise<LegislativeBill[]> {
  const apiKey: string | undefined = getCongressApiKey();
  if (!apiKey) return [];

  const bills: LegislativeBill[] | null = await fetchBillsPage({
    apiKey,
    offset,
    limit: DEFAULT_PAGE_SIZE,
    congress,
    sort: RECENTLY_UPDATED_FIRST,
  });

  return bills ?? [];
}

/** What {@link getBillById} resolved: the bill (if any), whether that came from live or preview data, and when. */
export type BillLookupResult = {
  /** The bill, or `undefined` for "no such record" (a 404). */
  bill: LegislativeBill | undefined;
  /** Whether this is a live record or a labeled placeholder. */
  source: CongressSnapshot["source"];
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
  /** When the read happened, as an ISO timestamp. */
  retrievedAt: string;
};

/**
 * Looks up a single bill directly, reporting the source the result came from.
 *
 * @param input - The bill's route params, straight from the URL.
 * @returns The lookup result. A `bill` of `undefined` means "no such record" (a 404), never a failure — a transient
 *   failure falls back to a snapshot search and then preview data first.
 */
export function getBillById(input: BillRouteParams): Promise<BillLookupResult> {
  return lookUpBillOnce(input.congress, input.type, input.number);
}

/**
 * {@link getBillById}, memoized for one server render. The bill page reads the bill in both `generateMetadata` and the
 * page, and Next's `fetch` dedupe skips requests carrying an `AbortSignal` (ours all do), while concluded-Congress bill
 * requests skip the Data Cache (see {@link billPageCacheWindow}). Keyed on the three strings because `cache` compares
 * by identity.
 */
const lookUpBillOnce = cache(
  (congress: string, type: string, number: string): Promise<BillLookupResult> => lookUpBill({ congress, type, number }),
);

/**
 * The uncached body of {@link getBillById}.
 *
 * @param input - The bill's route params.
 * @returns The bill, or `undefined` in its place when nothing matches, with its provenance.
 */
async function lookUpBill(input: BillRouteParams): Promise<BillLookupResult> {
  const apiKey: string | undefined = getCongressApiKey();
  const retrievedAt: string = new Date().toISOString();

  if (!apiKey) {
    return { bill: findPreviewBill(input), source: "preview", retrievedAt };
  }

  const route: NormalizedBillRoute | null = normalizeBillRouteParams(input);
  if (!route) {
    return { bill: undefined, source: "live", retrievedAt };
  }

  const result: CongressRequestResult<CongressApiDetailResponse> = await requestBillDetail(
    route,
    apiKey,
    `bill lookup for ${route.type.toUpperCase()} ${route.number}`,
    billPageCacheWindow(route.congress),
  );

  if (result.outcome === "not-found") return { bill: undefined, source: "live", retrievedAt };

  if (result.outcome === "ok") {
    const bill: LegislativeBill | null = result.data.bill ? mapCongressBill(result.data.bill) : null;
    return { bill: bill ?? undefined, source: "live", retrievedAt };
  }

  // A transient failure mustn't read as "not found": fall back to a snapshot search, then preview data. The snapshot is
  // scoped to *this bill's* Congress — the current Congress's page can't contain an older bill, and a `live` miss would
  // render as a 404 for a bill that exists.
  const snapshot: CongressSnapshot = await getCongressSnapshotForCongress(Number(route.congress));
  const key: string = billIdentityKey(input);
  const bill: LegislativeBill | undefined =
    snapshot.bills.find((candidate: LegislativeBill): boolean => billIdentityKey(candidate) === key) ??
    findPreviewBill(input);

  // The snapshot's own retrievedAt reflects when that fallback data was actually fetched, which is more accurate here
  // than this function's own start time.
  return { bill, source: snapshot.source, notice: snapshot.notice, retrievedAt: snapshot.retrievedAt };
}

/**
 * Fetches every CRS summary on file for a bill, most recent first — one per stage the text has reached.
 *
 * @param input - The bill's route params.
 * @returns Every summary, newest first. In preview mode, the fixture's labeled summary if it has one. Empty and flagged
 *   unavailable on failure.
 * @see BillSubResource
 */
export async function getBillSummaries(input: BillRouteParams): Promise<BillSubResource<BillSummary>> {
  if (!getCongressApiKey()) {
    const text: string | undefined = previewSummaries[billIdentityKey(input)];
    if (!text) return { entries: [], unavailable: false };

    return {
      entries: [
        {
          versionCode: "00",
          actionDesc: "Preview Summary",
          actionDate: findPreviewBill(input)?.introducedDate,
          html: sanitizeSummaryHtml(`<p>${text}</p>`),
        },
      ],
      unavailable: false,
    };
  }

  return fetchBillSubResource(input, {
    path: "summaries",
    schema: congressApiSummariesResponseSchema,
    select: (payload: CongressApiSummariesResponse): CongressApiSummary[] | undefined => payload.summaries,
    map: mapCongressSummary,
    dateKey: "actionDate",
  });
}

/**
 * Fetches a bill's full action history, most recent first. The stage stepper reads its action codes (see
 * {@link inferStageFromActions}), and it's the only source of Senate roll calls.
 *
 * Not deduplicated: which source system recorded an action is part of the record. Only votes are deduplicated.
 *
 * @param input - The bill's route params.
 * @returns Every action, newest first. Empty and answered in preview mode and on a 404; empty and flagged unavailable
 *   on failure.
 * @see collectRecordedVotes
 * @see BillSubResource
 */
export async function getBillActions(input: BillRouteParams): Promise<BillSubResource<BillAction>> {
  return fetchBillSubResource(input, {
    path: "actions",
    schema: congressApiActionsResponseSchema,
    select: (payload: CongressApiActionsResponse): CongressApiAction[] | undefined => payload.actions,
    map: mapCongressAction,
    dateKey: "date",
  });
}

/**
 * Fetches every official text version for a bill, most recent first, each linking to its renderings on Congress.gov.
 * The app links to the text rather than re-hosting it.
 *
 * @param input - The bill's route params.
 * @returns Every text version, newest first. Always empty in preview mode (fixtures don't fabricate document links).
 *   Empty and flagged unavailable on failure.
 * @see BillSubResource
 */
export async function getBillTextVersions(input: BillRouteParams): Promise<BillSubResource<BillTextVersion>> {
  return fetchBillSubResource(input, {
    path: "text",
    schema: congressApiTextResponseSchema,
    select: (payload: CongressApiTextResponse): CongressApiTextVersion[] | undefined => payload.textVersions,
    map: mapCongressTextVersion,
    dateKey: "date",
  });
}

/**
 * Sorts search matches for display: an exact citation hit (`pinnedKey`) first, then by latest action, newest first.
 *
 * @param a - One bill to compare.
 * @param b - The other bill to compare.
 * @param pinnedKey - The `billIdentityKey` of the citation hit to pin first, if the query named one.
 * @returns A standard comparator result.
 */
function compareSearchMatches(a: LegislativeBill, b: LegislativeBill, pinnedKey: string | undefined): number {
  if (pinnedKey) {
    const aPinned: boolean = billIdentityKey(a) === pinnedKey;
    const bPinned: boolean = billIdentityKey(b) === pinnedKey;
    // The `-1` arm never runs: the caller prepends the pinned bill, so V8's sort never presents it as `a`. Kept anyway
    // so the comparator is correct on its own terms rather than only in the one order it is called in today.
    /* v8 ignore start */
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    /* v8 ignore stop */
  }

  return compareIsoDatesDesc(a.latestAction.date ?? "", b.latestAction.date ?? "");
}

/**
 * Searches for bills matching `query` across every supported Congress.
 *
 * Congress.gov has no keyword search, so this sweeps each Congress's most recently updated bills (up to the API's
 * per-request ceiling) and matches title, type, number, policy area, and latest action. The UI states both limits: no
 * full text, and only a recent slice of each Congress — `congressesSearched` counts Congresses, not every bill.
 *
 * A query that parses as a citation ("HR 284" — see `parseBillCitation`) also gets a direct lookup, pinned first. The
 * sweep reuses browsing's cached page fetches, so repeated searches cost nothing extra upstream.
 *
 * @param query - The raw search text, as typed.
 * @returns Matching bills (citation hit first, then newest-first), capped at {@link MAX_SEARCH_RESULTS}, with the
 *   sweep's provenance and whether the cap truncated the results. Falls back to filtering the small preview fixture set
 *   when no key is configured.
 */
export async function getSearchResults(query: string): Promise<BillSearchResponse> {
  const trimmedQuery: string = query.trim();
  const apiKey: string | undefined = getCongressApiKey();

  if (!apiKey) {
    const bills: LegislativeBill[] = previewBills.filter((bill: LegislativeBill): boolean =>
      matchesQuery(bill, trimmedQuery),
    );
    return { bills, source: "preview", congressesSearched: 0, truncated: false };
  }

  const currentCongress: number = getCurrentCongress();
  const congresses: number[] = listCongresses(currentCongress).map((entry): number => entry.number);

  const citation: ParsedBillCitation | null = parseBillCitation(trimmedQuery);
  const citationLookup: Promise<LegislativeBill | undefined> = citation
    ? getBillById({
        congress: String(citation.congress ?? currentCongress),
        type: citation.type,
        number: citation.number,
      }).then((result: BillLookupResult): LegislativeBill | undefined => result.bill)
    : Promise.resolve(undefined);

  const [citationBill, pages]: [LegislativeBill | undefined, (LegislativeBill[] | null)[]] = await Promise.all([
    citationLookup,
    Promise.all(
      congresses.map(
        (congress: number): Promise<LegislativeBill[] | null> =>
          fetchBillsPage({ apiKey, offset: 0, limit: SEARCH_PAGE_LIMIT, congress, sort: RECENTLY_UPDATED_FIRST }),
      ),
    ),
  ]);

  const swept: LegislativeBill[] = pages
    .flatMap((page: LegislativeBill[] | null): LegislativeBill[] => page ?? [])
    .filter((bill: LegislativeBill): boolean => matchesQuery(bill, trimmedQuery));

  const pinnedKey: string | undefined = citationBill ? billIdentityKey(citationBill) : undefined;
  const deduped: LegislativeBill[] = citationBill
    ? [citationBill, ...swept.filter((bill: LegislativeBill): boolean => billIdentityKey(bill) !== pinnedKey)]
    : swept;
  deduped.sort((a: LegislativeBill, b: LegislativeBill): number => compareSearchMatches(a, b, pinnedKey));

  return {
    bills: deduped.slice(0, MAX_SEARCH_RESULTS),
    source: "live",
    congressesSearched: congresses.length,
    truncated: deduped.length > MAX_SEARCH_RESULTS,
  };
}
