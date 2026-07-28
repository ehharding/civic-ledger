import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { buildPreviewComposition, previewBills, previewSummaries } from "@/lib/congress/fixtures";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
  normalizeChamberName,
  normalizePartyName,
} from "@/lib/congress/members";
import { sanitizeSummaryHtml } from "@/lib/congress/sanitize-summary";
import { matchesQuery, type ParsedBillCitation, parseBillCitation } from "@/lib/congress/search";
import { inferBillStage } from "@/lib/congress/stage";
import {
  type BillRouteParams,
  type BillSponsor,
  type BillSummary,
  type BillTextFormat,
  type BillTextVersion,
  billIdentityKey,
  type CongressSnapshot,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** Shape of one entry in a detail-endpoint bill's `sponsors` array. */
type CongressApiSponsor = {
  bioguideId?: string;
  fullName?: string;
  party?: string;
  state?: string;
};

/**
 * Subset of a Congress.gov API bill object actually used by this app — both the list and detail endpoint shapes, since
 * mapCongressBill handles either.
 */
type CongressApiBill = {
  congress?: number;
  // The list endpoint uses `type`/`number`; the single-bill detail endpoint uses `billType`/`billNumber`.
  // Both are accepted so one mapper covers both.
  type?: string;
  billType?: string;
  number?: string | number;
  billNumber?: string | number;
  title?: string;
  originChamber?: string;
  introducedDate?: string;
  updateDate?: string;
  url?: string;
  policyArea?: { name?: string };
  latestAction?: { actionDate?: string; text?: string };
  // Only populated on the detail endpoint — the list endpoint doesn't return either field.
  sponsors?: CongressApiSponsor[];
  cosponsors?: { count?: number };
};

/** Shape of GET /v3/bill (the list endpoint). */
type CongressApiListResponse = {
  bills?: CongressApiBill[];
};

/** Shape of GET /v3/bill/{congress}/{type}/{number} (the single-bill detail endpoint). */
type CongressApiDetailResponse = {
  bill?: CongressApiBill;
};

/** Shape of GET /v3/bill/{congress}/{type}/{number}/summaries. */
type CongressApiSummary = {
  versionCode?: string;
  actionDesc?: string;
  actionDate?: string;
  text?: string;
};

type CongressApiSummariesResponse = {
  summaries?: CongressApiSummary[];
};

/** Shape of GET /v3/bill/{congress}/{type}/{number}/text. */
type CongressApiTextFormat = {
  type?: string;
  url?: string;
};

type CongressApiTextVersion = {
  type?: string;
  date?: string;
  formats?: CongressApiTextFormat[];
};

type CongressApiTextResponse = {
  textVersions?: CongressApiTextVersion[];
};

/**
 * Shape of one entry in GET /v3/member/congress/{congress} (the member *list* endpoint).
 *
 * Note that list-level member records are a smaller shape than item-level ones: there's no `memberType`
 * ("Representative" / "Delegate" / "Senator") and no per-term `congress`, and `terms.item[]` carries only
 * chamber/startYear/endYear. That's why chamber is read from the last recognizable term rather than from a term matched
 * on congress number, and why non-voting House seats are derived from the represented jurisdiction (see
 * `isNonVotingJurisdiction`) — the alternative is one extra request per member, ~540 of them.
 */
type CongressApiMemberTerm = {
  chamber?: string;
  startYear?: number;
  endYear?: number;
};

type CongressApiMember = {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number;
  terms?: { item?: CongressApiMemberTerm[] };
};

type CongressApiMemberListResponse = {
  members?: CongressApiMember[];
  pagination?: { count?: number };
};

/** Base URL for every Congress.gov v3 request this adapter makes. */
const CONGRESS_API_BASE: string = "https://api.congress.gov/v3";

/** The only bill/resolution type path segments Congress.gov's bill endpoint accepts. */
const BILL_PATH_TYPES: ReadonlySet<string> = new Set([
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
]);

const CONGRESS_SEGMENT_PATTERN: RegExp = /^\d{1,3}$/;
const BILL_NUMBER_SEGMENT_PATTERN: RegExp = /^\d{1,6}$/;

/**
 * Narrows potentially user-influenced bill route params to the exact path-segment formats we allow before constructing
 * an outbound Congress.gov URL.
 */
function normalizeBillRouteParams(input: BillRouteParams): { congress: string; type: string; number: string } | null {
  const congress: string = input.congress.trim();
  const type: string = input.type.trim().toLowerCase();
  const number: string = input.number.trim();

  if (!CONGRESS_SEGMENT_PATTERN.test(congress)) return null;
  if (!BILL_PATH_TYPES.has(type)) return null;
  if (!BILL_NUMBER_SEGMENT_PATTERN.test(number)) return null;

  return { congress, type, number };
}

/**
 * How long Next caches a Congress.gov response before revalidating, in seconds. One shared constant so the app's
 * "five-minute caching" story (see docs/architecture.md and the README's Data Policy) lives in a single place instead
 * of four separately-edited literals.
 */
const REVALIDATE_SECONDS: number = 300;

/**
 * Builds a Congress.gov v3 request URL: `path` under CONGRESS_API_BASE, `format=json` (requested explicitly per the
 * API's own changelog recommendation), any endpoint-specific params, and `api_key` last.
 */
function buildCongressUrl(path: string, apiKey: string, params: Record<string, string> = {}): URL {
  const url: URL = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("api_key", apiKey);
  return url;
}

/**
 * Issues a GET request against a Congress.gov v3 endpoint with this app's standard cache window and headers.
 * Callers still own status-code handling (e.g., treating 404 as "not found" vs. a real error) since that differs across
 * endpoints.
 */
function fetchCongressGov(url: URL, tags: string[]): Promise<Response> {
  return fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS, tags },
    headers: { Accept: "application/json" },
  });
}

/** The two cache tags shared by every request scoped to one specific bill (summaries, text versions, detail lookup). */
function billCacheTags(input: BillRouteParams): string[] {
  return ["congress-bills", `bill-${input.congress}-${input.type}-${input.number}`];
}

/**
 * Narrows an arbitrary API string to the app's closed originChamber union, defaulting to "Unknown" for anything
 * unexpected.
 */
function asOriginChamber(value?: string): LegislativeBill["originChamber"] {
  if (value === "House" || value === "Senate") return value;
  return "Unknown";
}

/**
 * Maps a raw Congress.gov API bill (list- or detail-shaped) into the app's stable LegislativeBill type.
 * Returns `null` when the record is missing a field the app actually depends on, so callers can filter incomplete
 * records out rather than rendering a broken card.
 */
function mapCongressBill(bill: CongressApiBill): LegislativeBill | null {
  const type: string | undefined = bill.type ?? bill.billType;
  const number: string | number | undefined = bill.number ?? bill.billNumber;

  if (!bill.congress || !bill.title || !type || !number) return null;

  const actionText: string = bill.latestAction?.text ?? "No action text has been published yet.";
  const sponsor: CongressApiSponsor | undefined = bill.sponsors?.[0];

  return {
    congress: bill.congress,
    type: type.toUpperCase(),
    number: String(number),
    title: bill.title,
    originChamber: asOriginChamber(bill.originChamber),
    introducedDate: bill.introducedDate,
    latestAction: {
      date: bill.latestAction?.actionDate ?? bill.updateDate,
      text: actionText,
    },
    policyArea: bill.policyArea?.name,
    stage: inferBillStage(actionText),
    officialUrl: bill.url ?? "https://www.congress.gov/",
    sponsor: sponsor?.fullName
      ? ({
          fullName: sponsor.fullName,
          party: sponsor.party,
          state: sponsor.state,
          bioguideId: sponsor.bioguideId,
        } satisfies BillSponsor)
      : undefined,
    cosponsorCount: bill.cosponsors?.count,
  };
}

/**
 * Maps a raw summaries-endpoint entry into the app's BillSummary shape. Returns `null` when the record is missing text
 * or an action description, so callers can filter incomplete records out.
 */
function mapCongressSummary(summary: CongressApiSummary): BillSummary | null {
  if (!summary.text || !summary.actionDesc) return null;

  return {
    versionCode: summary.versionCode ?? "00",
    actionDesc: summary.actionDesc,
    actionDate: summary.actionDate,
    html: sanitizeSummaryHtml(summary.text),
  };
}

/**
 * Maps a raw text-endpoint entry into the app's BillTextVersion shape. Returns `null` when the record is missing a type
 * or has no usable formats, so callers can filter incomplete records out.
 */
function mapCongressTextVersion(version: CongressApiTextVersion): BillTextVersion | null {
  if (!version.type) return null;

  const formats: BillTextFormat[] = (version.formats ?? []).filter(
    (format: CongressApiTextFormat): format is BillTextFormat => Boolean(format.type && format.url),
  );
  if (formats.length === 0) return null;

  return { type: version.type, date: version.date, formats };
}

/**
 * Maps a raw member-list entry into the app's `CongressMember` shape, paired with the chamber that member sits in.
 * Returns `null` when the record has no name or no recognizable chamber, so callers can filter it out rather than seat
 * an unidentifiable member.
 *
 * Chamber comes from the *last* recognizable entry in `terms.item[]` — a member who moved from the House to the Senate
 * should be seated in the Senate. List-level term entries don't carry a congress number to match on, so "most recent
 * term" is the closest available reading, and it's the correct one for a request already scoped to the members
 * currently serving in one Congress.
 */
function mapCongressMember(member: CongressApiMember): { chamber: CongressChamber; member: CongressMember } | null {
  const name: string | undefined = member.name?.trim();
  if (!name) return null;

  let chamber: CongressChamber | null = null;
  for (const term of member.terms?.item ?? []) {
    chamber = normalizeChamberName(term.chamber) ?? chamber;
  }
  if (!chamber) return null;

  return {
    chamber,
    member: {
      bioguideId: member.bioguideId,
      name,
      party: normalizePartyName(member.partyName),
      partyName: member.partyName,
      state: member.state,
      district: member.district,
    },
  };
}

/**
 * Sorts summaries by `actionDate`, most recent first, so callers can treat the first entry as "the bill as it stands
 * now." Entries without a date sort last. Plain string comparison is enough since summaries' `actionDate`
 * (`YYYY-MM-DD`) sorts correctly as a string.
 */
function sortSummariesByDateDesc(summaries: BillSummary[]): BillSummary[] {
  return [...summaries].sort((a: BillSummary, b: BillSummary): number =>
    (b.actionDate ?? "").localeCompare(a.actionDate ?? ""),
  );
}

/**
 * Sorts text versions by `date`, most recent first. Entries without a date sort last. Plain string comparison is enough
 * since text versions' `date` is a full ISO 8601 timestamp, which also sorts correctly as a string.
 */
function sortTextVersionsByDateDesc(versions: BillTextVersion[]): BillTextVersion[] {
  return [...versions].sort((a: BillTextVersion, b: BillTextVersion): number =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );
}

/**
 * Locates a matching fixture in previewBills by natural bill identifier. Used both as the no-key path and as a
 * last-resort fallback when a live lookup fails.
 */
function findPreviewBill(input: BillRouteParams): LegislativeBill | undefined {
  return previewBills.find(
    (bill) =>
      bill.congress === Number(input.congress) &&
      bill.type.toLowerCase() === input.type.toLowerCase() &&
      bill.number === input.number,
  );
}

/**
 * Fetches one page of the bill list for a specific Congress. Returns `null` on any failure so callers can decide
 * how to fall back (preview data for the homepage, an empty page for "Load More").
 *
 * Filtered explicitly by congress via the URL path (a documented filter — see BillEndpoint.md) rather than calling
 * the unfiltered `/v3/bill` list. That unfiltered list isn't sorted by congress number or introduction date, so it
 * can surface bills from any Congress in the API's history depending on which records happened to update recently;
 * filtering by congress guarantees every bill returned actually belongs to the one requested.
 */
async function fetchBillsPage(input: {
  apiKey: string;
  offset: number;
  limit: number;
  congress: number;
  /** Optional Congress.gov sort hint (e.g., "updateDate+desc"). Omitted for normal browsing/pagination; the search
   * sweep (getSearchResults) passes one so each Congress's fetched page favors its most recently active bills. */
  sort?: string;
}): Promise<LegislativeBill[] | null> {
  const url: URL = buildCongressUrl(`/bill/${input.congress}`, input.apiKey, {
    limit: String(input.limit),
    offset: String(input.offset),
    ...(input.sort ? { sort: input.sort } : {}),
  });

  try {
    const response: Response = await fetchCongressGov(url, ["congress-bills"]);

    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiListResponse;
    const bills: LegislativeBill[] = (payload.bills ?? [])
      .map(mapCongressBill)
      .filter((bill: LegislativeBill | null): bill is LegislativeBill => bill !== null);

    return bills;
  } catch (error) {
    console.error("[congress] Failed to fetch the live bill list, falling back to preview data:", error);
    return null;
  }
}

/**
 * Fetches the first page of a specific Congress's bills. This is the shared implementation behind both the
 * current-Congress homepage/directory (`getCongressSnapshot` below) and the `/bills/[congress]` route, so both share
 * one caching policy and one fallback story rather than drifting apart.
 *
 * Falls back to the labeled preview fixtures whenever live data isn't available — no `CONGRESS_API_KEY` configured, or
 * the upstream request fails/returns nothing. The preview fallback is itself filtered to the requested Congress (a bill
 * from a different Congress is not a preview of this one), so a Congress with no fixture data honestly reports an
 * empty, labeled result rather than borrowing bills from elsewhere. Callers should read `source` on the returned
 * snapshot rather than assuming success; this function never throws.
 */
export async function getCongressSnapshotForCongress(congress: number): Promise<CongressSnapshot> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  const retrievedAt: string = new Date().toISOString();
  const previewForCongress: LegislativeBill[] = previewBills.filter(
    (bill: LegislativeBill): boolean => bill.congress === congress,
  );

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
 * A thin wrapper around `getCongressSnapshotForCongress` — see that function for the actual fetch/fallback behavior.
 */
export async function getCongressSnapshot(): Promise<CongressSnapshot> {
  return getCongressSnapshotForCongress(getCurrentCongress());
}

/**
 * Fetches an additional page of live bills for "Load More" pagination, for a given Congress (the current one by
 * default, so existing single-argument callers are unaffected).
 * Only meaningful when a live key is configured; returns an empty page otherwise so the UI can simply stop offering
 * more results.
 */
export async function getMoreBills(
  offset: number,
  congress: number = getCurrentCongress(),
): Promise<LegislativeBill[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];

  const bills: LegislativeBill[] | null = await fetchBillsPage({ apiKey, offset, limit: DEFAULT_PAGE_SIZE, congress });

  return bills ?? [];
}

/**
 * Members requested per page — the Congress.gov API's own per-request ceiling, so a chamber needs as few calls as
 * possible.
 */
const MEMBER_PAGE_LIMIT: number = 250;

/**
 * Hard ceiling on member pages fetched for one Congress. A seated Congress is a little over 540 members (535 voting
 * seats plus the six non-voting House seats, minus any vacancies), so three pages covers it with room to spare; the cap
 * exists so a malformed `pagination.count` can't turn one page render into an unbounded fetch loop.
 */
const MAX_MEMBER_PAGES: number = 4;

/**
 * Fetches one page of the member list for a Congress. Returns `null` on any failure so the caller can decide whether a
 * partial result is still worth rendering.
 *
 * `currentMember=true` is what makes this "who holds a seat right now" rather than "everyone who served at any point in
 * this Congress" — without it, a member who resigned mid-term and the member who replaced them both come back, and the
 * chamber over-counts. (Congress.gov's own documentation makes the mirror-image recommendation for *past* Congresses,
 * where `currentMember=false` is what yields the complete historical roster.)
 */
async function fetchMemberPage(input: {
  apiKey: string;
  congress: number;
  offset: number;
}): Promise<CongressApiMemberListResponse | null> {
  const url: URL = buildCongressUrl(`/member/congress/${input.congress}`, input.apiKey, {
    limit: String(MEMBER_PAGE_LIMIT),
    offset: String(input.offset),
    currentMember: "true",
  });

  try {
    const response: Response = await fetchCongressGov(url, ["congress-members"]);

    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    return (await response.json()) as CongressApiMemberListResponse;
  } catch (error) {
    console.error("[congress] Failed to fetch a member page:", error);
    return null;
  }
}

/**
 * Fetches every currently-seated member of a Congress, across as many pages as it takes.
 *
 * The first page is fetched on its own to read `pagination.count`, and the remaining pages then go out together rather
 * than one after another — two round trips instead of three sequential ones. Returns `null` only when the *first* page
 * fails; a later page failing yields the members that did arrive, since a chart of most of the chamber still beats no
 * chart at all (and the missing seats simply aren't drawn).
 */
async function fetchAllMembers(apiKey: string, congress: number): Promise<CongressApiMember[] | null> {
  const firstPage: CongressApiMemberListResponse | null = await fetchMemberPage({ apiKey, congress, offset: 0 });
  if (!firstPage) return null;

  const firstMembers: CongressApiMember[] = firstPage.members ?? [];
  const total: number = firstPage.pagination?.count ?? firstMembers.length;
  const pageCount: number = Math.min(MAX_MEMBER_PAGES, Math.ceil(total / MEMBER_PAGE_LIMIT));

  if (pageCount <= 1) return firstMembers;

  const laterPages: (CongressApiMemberListResponse | null)[] = await Promise.all(
    Array.from(
      { length: pageCount - 1 },
      (_unused: unknown, index: number): Promise<CongressApiMemberListResponse | null> =>
        fetchMemberPage({ apiKey, congress, offset: (index + 1) * MEMBER_PAGE_LIMIT }),
    ),
  );

  return [
    ...firstMembers,
    ...laterPages.flatMap((page: CongressApiMemberListResponse | null): CongressApiMember[] => page?.members ?? []),
  ];
}

/** Groups mapped members into one `ChamberComposition` per chamber, in `congressChambers` order. */
function buildComposition(members: { chamber: CongressChamber; member: CongressMember }[]): ChamberComposition[] {
  return congressChambers.map(
    (chamber: CongressChamber): ChamberComposition =>
      buildChamberComposition(
        chamber,
        members.filter((entry): boolean => entry.chamber === chamber).map((entry): CongressMember => entry.member),
      ),
  );
}

/**
 * Fetches the membership of both chambers of a Congress — who currently holds each seat — for the home page's chamber
 * diagram.
 *
 * Like every other read in this adapter, this never throws and always reports its own provenance: a missing API key or
 * a failed upstream request yields clearly labeled placeholder seats rather than an empty or broken chart. A chamber
 * that comes back empty is treated as a failure of the whole fetch rather than rendered as an empty half of Congress,
 * since "the Senate has no members" is never a true statement about a seated Congress and would read as one.
 */
export async function getCongressComposition(congress: number = getCurrentCongress()): Promise<CongressComposition> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  const retrievedAt: string = new Date().toISOString();

  if (!apiKey) {
    return buildPreviewComposition(
      congress,
      retrievedAt,
      "Placeholder seats are shown until a server-only Congress.gov API key is configured.",
    );
  }

  const raw: CongressApiMember[] | null = await fetchAllMembers(apiKey, congress);
  const mapped: { chamber: CongressChamber; member: CongressMember }[] = (raw ?? [])
    .map(mapCongressMember)
    .filter((entry): entry is { chamber: CongressChamber; member: CongressMember } => entry !== null);

  const chambers: ChamberComposition[] = buildComposition(mapped);

  if (chambers.some((chamber: ChamberComposition): boolean => chamber.members.length === 0)) {
    return buildPreviewComposition(
      congress,
      retrievedAt,
      "Live membership is temporarily unavailable, so placeholder seats are shown.",
    );
  }

  return { congress, chambers, source: "live", retrievedAt };
}

/** Max bills fetched per Congress when sweeping for a search — the Congress.gov API's own per-request ceiling. */
const SEARCH_PAGE_LIMIT: number = 250;

/** Max bills returned from a single search, across every Congress swept together. */
const MAX_SEARCH_RESULTS: number = 60;

/** Result of a cross-Congress bill search — see getSearchResults. */
export type BillSearchResult = {
  bills: LegislativeBill[];
  source: CongressSnapshot["source"];
  /** How many Congresses this search actually swept. */
  congressesSearched: number;
  /** Whether more matches existed than MAX_SEARCH_RESULTS allows returning. */
  truncated: boolean;
};

/**
 * Sorts search matches for display: a citation-lookup hit (identified by `pinnedKey`, if any) always sorts first, since
 * it's an exact, deliberate match rather than an incidental text one; everything else sorts by latestAction date, most
 * recent first, same as the rest of this adapter's date-ordered lists.
 */
function compareSearchMatches(a: LegislativeBill, b: LegislativeBill, pinnedKey: string | undefined): number {
  if (pinnedKey) {
    const aPinned: boolean = billIdentityKey(a) === pinnedKey;
    const bPinned: boolean = billIdentityKey(b) === pinnedKey;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
  }
  return (b.latestAction.date ?? "").localeCompare(a.latestAction.date ?? "");
}

/**
 * Searches for bills matching free-text `query` across every Congress this app supports browsing (see
 * `listCongresses`).
 *
 * Congress.gov's API has no full-text search endpoint (see docs/decisions.md) — the list endpoint can only be filtered
 * by congress and bill type, not by keyword. This approximates a broad search the only way the API allows:
 *
 * It sweeps each supported Congress's most recently active bills (sorted by `updateDate`, up to the API's own
 * 250-per-request ceiling) and matches `query` against their title, type, number, policy area, and latest action text —
 * the same fields BillCard and the bill detail page already surface (see `matchesQuery`). It cannot see a bill's full
 * legislative text, and for a large or old Congress it only sees that Congress's most recently touched slice, not
 * literally every bill ever introduced in it.
 *
 * When `query` parses as a bill citation (e.g., "HR 284", "H.J.Res. 66" — see `parseBillCitation`), a direct
 * single-bill lookup is also attempted (in the cited Congress, or the current one if none was given) and, if found, is
 * placed first — this resolves instantly and exactly, rather than depending on the swept text happening to contain a
 * literal match.
 *
 * Every swept Congress reuses `fetchBillsPage`, and so the same five-minute cache as ordinary browsing — a search is
 * not materially more expensive to the upstream API than the traffic this app already generates, since concurrent and
 * repeated searches within the cache window are served from that same cache rather than each re-fetching every Congress
 * from Congress.gov.
 *
 * Falls back to filtering the small, fixed preview fixture set when no API key is configured, like every other data
 * path in this adapter.
 */
export async function getSearchResults(query: string): Promise<BillSearchResult> {
  const trimmedQuery: string = query.trim();
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;

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

/** What getBillById actually resolved: the bill (if any), whether that came from live or preview data, and when. */
export type BillLookupResult = {
  bill: LegislativeBill | undefined;
  source: CongressSnapshot["source"];
  notice?: string;
  retrievedAt: string;
};

/**
 * Looks up a single bill directly, rather than searching only the first page of the list snapshot.
 * This lets any real bill resolve correctly, not just the dozen most recently returned by the list endpoint.
 *
 * Also reports the source (live/preview) the result actually came from, so callers — namely the bill detail page — can
 * render an accurate DataSourceNotice without a second, separate snapshot fetch.
 */
export async function getBillById(input: BillRouteParams): Promise<BillLookupResult> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  const retrievedAt: string = new Date().toISOString();

  if (!apiKey) {
    return { bill: findPreviewBill(input), source: "preview", retrievedAt };
  }

  const normalized: { congress: string; type: string; number: string } | null = normalizeBillRouteParams(input);
  if (!normalized) {
    return { bill: undefined, source: "live", retrievedAt };
  }

  const url: URL = buildCongressUrl(`/bill/${normalized.congress}/${normalized.type}/${normalized.number}`, apiKey);

  try {
    const response: Response = await fetchCongressGov(url, billCacheTags(input));

    if (response.status === 404) return { bill: undefined, source: "live", retrievedAt };
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiDetailResponse;
    const bill: LegislativeBill | null = payload.bill ? mapCongressBill(payload.bill) : null;

    return { bill: bill ?? undefined, source: "live", retrievedAt };
  } catch (error) {
    // A transient failure shouldn't be indistinguishable from "not found"; fall back to a snapshot search, then to
    // preview data as a last resort.
    console.error("[congress] Direct bill lookup failed, falling back to a snapshot search:", error);
    const snapshot: CongressSnapshot = await getCongressSnapshot();
    const bill: LegislativeBill | undefined =
      snapshot.bills.find(
        (candidate) =>
          candidate.congress === Number(input.congress) &&
          candidate.type.toLowerCase() === input.type.toLowerCase() &&
          candidate.number === input.number,
      ) ?? findPreviewBill(input);

    // The snapshot's own retrievedAt reflects when that fallback data was actually fetched, which is more accurate here
    // than this function's own start time.
    return { bill, source: snapshot.source, notice: snapshot.notice, retrievedAt: snapshot.retrievedAt };
  }
}

/**
 * Fetches every CRS summary on file for a bill, most recent first. A bill can have several — one per stage it's reached
 * (introduced, reported, passed, etc.) — since the text, and so the summary, can change at each stage.
 *
 * Falls back to a single labeled, fictional preview summary when no API key is configured (see `previewSummaries`),
 * and to an empty list on any live-request failure — the caller renders that as "no summary published yet" rather than
 * an error, since that's also a real, valid state for a newly introduced bill.
 */
export async function getBillSummaries(input: BillRouteParams): Promise<BillSummary[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;

  if (!apiKey) {
    const text: string | undefined = previewSummaries[billIdentityKey(input)];
    if (!text) return [];

    return [
      {
        versionCode: "00",
        actionDesc: "Preview Summary",
        actionDate: findPreviewBill(input)?.introducedDate,
        html: sanitizeSummaryHtml(`<p>${text}</p>`),
      },
    ];
  }

  // The max page size, requested explicitly so a single call covers the rare bill with more than the default 20.
  const url: URL = buildCongressUrl(
    `/bill/${input.congress}/${input.type.toLowerCase()}/${input.number}/summaries`,
    apiKey,
    { limit: "250" },
  );

  try {
    const response: Response = await fetchCongressGov(url, billCacheTags(input));

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiSummariesResponse;
    const summaries: BillSummary[] = (payload.summaries ?? [])
      .map(mapCongressSummary)
      .filter((summary: BillSummary | null): summary is BillSummary => summary !== null);

    return sortSummariesByDateDesc(summaries);
  } catch (error) {
    console.error("[congress] Failed to fetch bill summaries:", error);
    return [];
  }
}

/**
 * Fetches every official text version on file for a bill (e.g. "Introduced in House", "Engrossed in House"), most
 * recent first, each with links to its Formatted Text / PDF / XML renderings on Congress.gov.
 *
 * These are links to the official record, not text this app fetches and re-hosts itself — consistent with this
 * app's "the official source stays the source of truth" stance (see docs/decisions.md). Returns an empty list in
 * preview mode (deliberately — see `previewSummaries` for why fixtures don't fabricate links to specific documents
 * that don't exist) and on any live-request failure.
 */
export async function getBillTextVersions(input: BillRouteParams): Promise<BillTextVersion[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];

  const url: URL = buildCongressUrl(
    `/bill/${input.congress}/${input.type.toLowerCase()}/${input.number}/text`,
    apiKey,
    {
      limit: "250",
    },
  );

  try {
    const response: Response = await fetchCongressGov(url, billCacheTags(input));

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiTextResponse;
    const versions: BillTextVersion[] = (payload.textVersions ?? [])
      .map(mapCongressTextVersion)
      .filter((version: BillTextVersion | null): version is BillTextVersion => version !== null);

    return sortTextVersionsByDateDesc(versions);
  } catch (error) {
    console.error("[congress] Failed to fetch bill text versions:", error);
    return [];
  }
}
