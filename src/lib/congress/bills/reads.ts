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
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  requestCongressJson,
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
 * Everything this app reads about *bills*: list snapshots, pagination, single-bill lookup, the CRS summary and official
 * text sub-resources, and cross-Congress search.
 *
 * Two invariants hold for every exported function here, and the rest of the app is written assuming them:
 *
 * 1. **Nothing throws.** Upstream failure is a normal, expected condition, not an exception — a page should degrade to
 *    clearly labeled preview data, never to an error boundary.
 * 2. **Provenance travels with the data.** Anything that can come from either live or preview data says which it was,
 *    on the same object, so no caller can render one while claiming the other.
 *
 * @see upstream/http.ts for the transport and caching policy these functions share.
 * @see upstream/mappers.ts for the upstream-to-internal translation they all run their results through.
 */

/** Max bills fetched per Congress when sweeping for a search — the API's own per-request ceiling. */
const SEARCH_PAGE_LIMIT: number = MAX_API_PAGE_SIZE;

/** Max bills returned from a single search, across every Congress swept together. */
const MAX_SEARCH_RESULTS: number = 60;

/**
 * Locates a matching fixture in `previewBills` by natural bill identifier.
 *
 * Matching goes through `billIdentityKey` rather than comparing three fields by hand, so the normalization rules
 * (case-insensitive type, numeric-or-string congress) are defined once and can't drift between call sites.
 *
 * @param input - The bill's route params.
 * @returns The matching preview fixture, or `undefined` when none covers that bill.
 */
function findPreviewBill(input: BillRouteParams): LegislativeBill | undefined {
  const key: string = billIdentityKey(input);
  return previewBills.find((bill: LegislativeBill): boolean => billIdentityKey(bill) === key);
}

/** Every preview fixture belonging to one Congress. A bill from another Congress is not a preview of this one. */
function previewBillsForCongress(congress: number): LegislativeBill[] {
  return previewBills.filter((bill: LegislativeBill): boolean => bill.congress === congress);
}

/**
 * Fetches one page of the bill list for a specific Congress.
 *
 * Filtered explicitly by congress via the URL path (a documented filter — see `BillEndpoint.md`) rather than calling
 * the unfiltered `/v3/bill` list. That unfiltered list isn't sorted by congress number or introduction date, so it can
 * surface bills from any Congress in the API's history depending on which records happened to update recently;
 * filtering by congress guarantees every bill returned actually belongs to the one requested.
 *
 * @param input - The API key, the Congress to read, the page window, and an optional Congress.gov sort hint (e.g.,
 *   `"updateDate+desc"`). The sort is omitted for ordinary browsing and passed by the search sweep, so each Congress's
 *   fetched page favors its most recently active bills.
 * @returns The mapped bills, or `null` on any failure — so callers can choose their own fallback (preview data for a
 *   page render, an empty page for "Load More").
 */
async function fetchBillsPage(input: {
  apiKey: string;
  offset: number;
  limit: number;
  congress: number;
  sort?: string;
}): Promise<LegislativeBill[] | null> {
  const url: URL = buildCongressUrl(`/bill/${input.congress}`, input.apiKey, {
    limit: String(input.limit),
    offset: String(input.offset),
    ...(input.sort ? { sort: input.sort } : {}),
  });

  const result: CongressRequestResult<CongressApiListResponse> = await requestCongressJson(
    url,
    [BILL_LIST_CACHE_TAG],
    congressApiListResponseSchema,
    `bill list for the ${formatOrdinal(input.congress)} Congress`,
  );

  if (result.outcome !== "ok") return null;

  return mapUsable(result.data.bills, mapCongressBill);
}

/**
 * Fetches the first page of a specific Congress's bills.
 *
 * This is the shared implementation behind both the current-Congress homepage/directory ({@link getCongressSnapshot})
 * and the `/bills/[congress]` route, so both share one caching policy and one fallback story rather than drifting
 * apart.
 *
 * Falls back to the labeled preview fixtures whenever live data isn't available — no key configured, or the upstream
 * request failed or returned nothing. The preview fallback is itself scoped to the requested Congress, so a Congress
 * with no fixture data honestly reports an empty, labeled result rather than borrowing bills from elsewhere.
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
 * @returns The next page, or an empty array when no key is configured or the request fails — either way the UI simply
 *   stops offering more results, which is the honest outcome in both cases.
 */
export async function getMoreBills(
  offset: number,
  congress: number = getCurrentCongress(),
): Promise<LegislativeBill[]> {
  const apiKey: string | undefined = getCongressApiKey();
  if (!apiKey) return [];

  const bills: LegislativeBill[] | null = await fetchBillsPage({ apiKey, offset, limit: DEFAULT_PAGE_SIZE, congress });

  return bills ?? [];
}

/** What {@link getBillById} resolved: the bill (if any), whether that came from live or preview data, and when. */
export type BillLookupResult = {
  bill: LegislativeBill | undefined;
  source: CongressSnapshot["source"];
  notice?: string;
  retrievedAt: string;
};

/**
 * Looks up a single bill directly, rather than searching only the first page of the list snapshot. This lets any real
 * bill resolve correctly, not just the dozen most recently returned by the list endpoint.
 *
 * Also reports the source the result actually came from, so callers — namely the bill detail page — can render an
 * accurate `DataSourceNotice` without a second, separate snapshot fetch.
 *
 * @param input - The bill's route params, straight from the URL.
 * @returns The lookup result. A `bill` of `undefined` means "no such record" and should render as a 404; it never means
 *   "something went wrong", because a transient failure falls back to a snapshot search and then to preview data before
 *   giving up.
 */
export async function getBillById(input: BillRouteParams): Promise<BillLookupResult> {
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
  );

  if (result.outcome === "not-found") return { bill: undefined, source: "live", retrievedAt };

  if (result.outcome === "ok") {
    const bill: LegislativeBill | null = result.data.bill ? mapCongressBill(result.data.bill) : null;
    return { bill: bill ?? undefined, source: "live", retrievedAt };
  }

  // A transient failure shouldn't be indistinguishable from "not found"; fall back to a snapshot search, then to
  // preview data as a last resort.
  //
  // The snapshot is scoped to *this bill's* Congress rather than the current one, and that is the whole reason this
  // branch does anything at all for a bill outside the seated Congress. `getCongressSnapshot()` here read the current
  // Congress's first page, which by construction cannot contain a 117th-Congress bill — so the `find` below could
  // never hit, and the wasted round trip then handed back its own `source: "live"`. That combination is the specific
  // failure this function's contract forbids: `bill: undefined` labeled `live` is read by the route as "no such record"
  // and rendered as a hard 404, so a momentary Congress.gov blip told a reader that a bill that exists does not. Scoped
  // correctly, the fallback either finds the bill or degrades to preview, and both are honest.
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
 * Fetches every CRS summary on file for a bill, most recent first.
 *
 * A bill can have several — one per stage it's reached (introduced, reported, passed, and so on) — since the text, and
 * so the summary, changes as the bill is amended. Earlier summaries aren't stale duplicates; they describe real earlier
 * versions of the text.
 *
 * @param input - The bill's route params.
 * @returns Every summary on file, newest first. In preview mode this is a single clearly labeled fictional summary (see
 *   `previewSummaries`), or an empty array for a fixture without one. Empty and flagged unavailable on failure, so the
 *   section never credits the Congressional Research Service with not having written something. @see BillSubResource.
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
 * Fetches a bill's full action history, most recent first.
 *
 * This is the record behind two things the bill page can otherwise only approximate. The stepper reads the Library of
 * Congress's own action codes rather than guessing a stage from one line of prose (@see inferStageFromActions) — which
 * matters most for a bill that has passed one chamber and been referred to a committee in the other, where the latest
 * action names only the referral. And the roll-call votes taken on the bill are named here and nowhere else in this API
 * for the Senate, since there is no `senate-vote` endpoint to ask.
 *
 * The list is deliberately not deduplicated. Congress.gov reports the same event from several source systems at once,
 * and which system recorded an action is part of the record rather than noise — the near-duplicate rows say that the
 * chamber's floor log and the Library of Congress both captured the same moment. Only the *votes* are deduplicated,
 * where repetition would read as two separate roll calls. @see collectRecordedVotes.
 *
 * @param input - The bill's route params.
 * @returns Every action on file, newest first. Empty and answered in preview mode and on a 404; empty and flagged
 *   unavailable on failure. The distinction reaches further here than in the other collections: the stage stepper and
 *   the recorded-vote panel are both derived from these actions, so an unread history is a page that cannot say where
 *   the bill is *or* whether anyone voted on it. @see BillSubResource.
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
 * Fetches every official text version on file for a bill (e.g., "Introduced in House", "Engrossed in House"), most
 * recent first, each with links to its Formatted Text / PDF / XML renderings on Congress.gov.
 *
 * These are links to the official record, not text this app fetches and re-hosts itself — consistent with the "the
 * source of truth stays upstream" stance in `docs/data-policy.md`.
 *
 * @param input - The bill's route params.
 * @returns Every text version on file, newest first. Always empty in preview mode — deliberately, since fixtures don't
 *   fabricate links to specific documents that don't exist. Empty and flagged unavailable on failure. @see
 *   BillSubResource.
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
 * Sorts search matches for display.
 *
 * A citation-lookup hit (identified by `pinnedKey`, if any) always sorts first, since it's an exact, deliberate match
 * rather than an incidental text one; everything else sorts by latest-action date, most recent first, the same as every
 * other date-ordered list in this adapter.
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
 * Searches for bills matching free-text `query` across every Congress this app supports browsing.
 *
 * Congress.gov's API has no full-text search endpoint (see `docs/data-policy.md`) — its list endpoint can be filtered
 * by congress and bill type, but not by keyword. This approximates a broad search the only way the API allows: it
 * sweeps each supported Congress's most recently active bills (sorted by `updateDate`, up to the API's own per-request
 * ceiling) and matches `query` against their title, type, number, policy area, and latest-action text — the same fields
 * `BillCard` and the bill detail page already surface.
 *
 * Two honest limits follow from that, and the UI states both: it cannot see a bill's full legislative text, and for a
 * large or old Congress it sees only that Congress's most recently touched slice, not literally every bill ever
 * introduced in it.
 *
 * When `query` parses as a bill citation ("HR 284", "H.J.Res. 66" — see `parseBillCitation`), a direct single-bill
 * lookup is also attempted, in the cited Congress or the current one, and pinned first when it resolves. That path is
 * exact and instant rather than depending on the swept text happening to contain a literal match.
 *
 * Every swept Congress reuses the same cached page fetch as ordinary browsing, so concurrent and repeated searches
 * within the cache window cost the upstream API nothing extra.
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
          fetchBillsPage({ apiKey, offset: 0, limit: SEARCH_PAGE_LIMIT, congress, sort: "updateDate+desc" }),
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
