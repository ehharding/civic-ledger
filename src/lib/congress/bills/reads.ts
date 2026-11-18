import { cache } from "react";

import type { BillSearchResponse } from "@/lib/api-contract";
import {
  type BillAction,
  type BillRouteParams,
  type BillSummary,
  type BillTextVersion,
  billIdentityKey,
  type CongressSnapshot,
  compareBillsByActivity,
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
import { formatOrdinal } from "@/lib/format";

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
 * The bill list endpoint's "most recently touched first" order, which every bill-list request asks for. Required rather
 * than left to the default, because `/v3/bill/{congress}` otherwise returns *ascending* latest-action order — a
 * Congress's least active bills — and every surface in this app leads with what is current. It is also the only sort
 * that endpoint honors, so there is nothing for a caller to choose.
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

/** The notice on a render that fell back to preview data because Congress.gov didn't answer. */
const LIVE_UNAVAILABLE_NOTICE: string = "Live records are temporarily unavailable, so preview records are shown.";

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

/** One request for a page of a Congress's bill list. */
type BillPageRequest = {
  /** The server-only Congress.gov key. */
  apiKey: string;
  /** The page offset. */
  offset: number;
  /** The page size. */
  limit: number;
  /** The Congress to read. */
  congress: number;
};

/**
 * Fetches one page of the bill list for a specific Congress, filtered by path and most recently updated first. The
 * unfiltered `/v3/bill` list mixes bills from every Congress.
 *
 * @param input - {@link BillPageRequest}.
 * @returns The mapped bills, or `null` on any failure — so callers can choose their own fallback (preview data for a
 *   page render, an empty page for "Load More").
 */
async function fetchBillsPage(input: BillPageRequest): Promise<LegislativeBill[] | null> {
  const url: URL = buildCongressUrl(`/bill/${input.congress}`, input.apiKey, {
    limit: String(input.limit),
    offset: String(input.offset),
    sort: RECENTLY_UPDATED_FIRST,
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
  });

  if (!bills || bills.length === 0) {
    return {
      bills: previewForCongress,
      source: "preview",
      retrievedAt,
      notice: LIVE_UNAVAILABLE_NOTICE,
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
  /**
   * Congress.gov did not answer, so `bill` is a preview fixture or nothing, never evidence the bill doesn't exist. The
   * bill page refuses to cache such a render rather than 404ing it. See refuseDegradedRender.
   */
  unavailable: boolean;
};

/**
 * Looks up a single bill directly, reporting the source the result came from.
 *
 * @param input - The bill's route params, straight from the URL.
 * @returns The lookup result. A `bill` of `undefined` with `unavailable` false means "no such record" (a 404). A
 *   transient failure sets `unavailable` and falls back to the preview fixture, if one covers this bill.
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
    return { bill: findPreviewBill(input), source: "preview", retrievedAt, unavailable: false };
  }

  const route: NormalizedBillRoute | null = normalizeBillRouteParams(input);
  if (!route) {
    return { bill: undefined, source: "live", retrievedAt, unavailable: false };
  }

  const result: CongressRequestResult<CongressApiDetailResponse> = await requestBillDetail(
    route,
    apiKey,
    `bill lookup for ${route.type.toUpperCase()} ${route.number}`,
    billPageCacheWindow(route.congress),
  );

  if (result.outcome === "not-found") return { bill: undefined, source: "live", retrievedAt, unavailable: false };

  if (result.outcome === "ok") {
    const bill: LegislativeBill | null = result.data.bill ? mapCongressBill(result.data.bill) : null;
    return { bill: bill ?? undefined, source: "live", retrievedAt, unavailable: false };
  }

  // No second request for a list snapshot to search: when Congress.gov is rate-limiting, it fails too, and spends quota
  // doing it. The page refuses to cache this render anyway, so the fixture only matters to the build's prerender.
  return {
    bill: findPreviewBill(input),
    source: "preview",
    notice: LIVE_UNAVAILABLE_NOTICE,
    retrievedAt,
    unavailable: true,
  };
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
 * The search a reader gets without Congress.gov: the preview fixtures, filtered. Reports no Congress as searched, since
 * none was.
 *
 * @param query - The trimmed search text.
 * @returns The matching fixtures, labeled as preview.
 */
function searchPreviewBills(query: string): BillSearchResponse {
  const bills: LegislativeBill[] = previewBills.filter((bill: LegislativeBill): boolean => matchesQuery(bill, query));
  return { bills, source: "preview", congressesSearched: 0, truncated: false };
}

/**
 * Searches for bills matching `query` across every supported Congress.
 *
 * Congress.gov has no keyword search, so this sweeps each Congress's most recently updated bills (up to the API's
 * per-request ceiling) and matches title, type, number, policy area, and latest action. The UI states both limits: no
 * full text, and only a recent slice of each Congress. `congressesSearched` counts the Congresses that *answered*, not
 * the ones asked, and the scope line under the results says so (see `describeBillSearchScope`).
 *
 * A query that parses as a citation ("HR 284" — see `parseBillCitation`) also gets a direct lookup, pinned first. The
 * sweep reuses browsing's cached page fetches, so repeated searches cost nothing extra upstream.
 *
 * @param query - The raw search text, as typed.
 * @returns Matching bills (citation hit first, then by {@link compareBillsByActivity}), capped at
 *   {@link MAX_SEARCH_RESULTS}, with the sweep's provenance and whether the cap truncated the results. Falls back to
 *   filtering the small preview fixture set when no key is configured, or when no Congress answered at all — a sweep
 *   nothing answered is not a live search, and reporting it as one would present "no matches" as a fact about the
 *   record.
 */
export async function getSearchResults(query: string): Promise<BillSearchResponse> {
  const trimmedQuery: string = query.trim();
  const apiKey: string | undefined = getCongressApiKey();

  if (!apiKey) return searchPreviewBills(trimmedQuery);

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
          fetchBillsPage({ apiKey, offset: 0, limit: SEARCH_PAGE_LIMIT, congress }),
      ),
    ),
  ]);

  const answered: LegislativeBill[][] = pages.filter(
    (page: LegislativeBill[] | null): page is LegislativeBill[] => page !== null,
  );
  if (answered.length === 0) return searchPreviewBills(trimmedQuery);

  const swept: LegislativeBill[] = answered
    .flat()
    .filter((bill: LegislativeBill): boolean => matchesQuery(bill, trimmedQuery));

  // The citation hit leads outright rather than through the comparator: it is the bill the reader named, so it is not
  // ranked against the sweep at all, and the sweep's own copy of it (if any) is dropped so it isn't listed twice.
  const pinnedKey: string | undefined = citationBill ? billIdentityKey(citationBill) : undefined;
  const rest: LegislativeBill[] = swept
    .filter((bill: LegislativeBill): boolean => billIdentityKey(bill) !== pinnedKey)
    .sort(compareBillsByActivity);
  const ranked: LegislativeBill[] = citationBill ? [citationBill, ...rest] : rest;

  return {
    bills: ranked.slice(0, MAX_SEARCH_RESULTS),
    source: "live",
    congressesSearched: answered.length,
    truncated: ranked.length > MAX_SEARCH_RESULTS,
  };
}
