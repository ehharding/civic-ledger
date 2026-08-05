import {
  ANY_FACET,
  type FacetFilter,
  parseEnumParam,
  parseQueryFilter,
  toQueryString,
} from "@/lib/congress/directory-filter";
import { BILL_TYPE_CODES, type BillStage, billStages, type LegislativeBill } from "@/lib/congress/types";

/**
 * The stage control's selection: one of the five legislative stages, or no narrowing at all.
 *
 * Spelled through the shared {@link FacetFilter} rather than as a bare `| "all"`, so this directory's "don't narrow"
 * value is the same declared sentinel the member and committee directories use rather than a string literal that
 * happens to match. @see ANY_FACET, and `directory-filter.ts` for the rest of the vocabulary all three share.
 */
export type BillStageFilter = FacetFilter<BillStage>;

/**
 * The query-param names the bill directory reads and writes.
 *
 * The counterpart to `MEMBER_DIRECTORY_PARAMS` in `member-filter.ts`, and here for the same reason: these names cross a
 * boundary — the server route parses them out of the request, the client component writes them back — and a typo on
 * either side produces a link that looks right and restores nothing.
 */
export const BILL_DIRECTORY_PARAMS = {
  query: "q",
  stage: "stage",
} as const;

/** Everything the `/bills` URL can express: what to search for, and which stage to narrow to. */
export type BillDirectoryQuery = {
  query: string;
  stage: BillStageFilter;
};

/** An unsearched, unnarrowed directory — what a bare `/bills` means. */
export const DEFAULT_BILL_DIRECTORY_QUERY: BillDirectoryQuery = { query: "", stage: ANY_FACET };

/**
 * Parses the `stage` query param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The stage, or {@link ANY_FACET} for anything unrecognized — a stale or hand-edited URL degrades to the
 *   unfiltered listing rather than to an error or an empty grid.
 */
export function parseBillStageFilter(raw: string | null | undefined): BillStageFilter {
  return parseEnumParam(raw, billStages, ANY_FACET);
}

/**
 * Reads a whole directory view out of a URL's query string.
 *
 * The exact counterpart to {@link billDirectoryQueryString}, and the peer of `parseMemberDirectoryQuery` and
 * `parseCommitteeDirectoryQuery`. Both sides of the boundary go through it — the route resolves the incoming request
 * with it, and the browser re-reads the address bar with it whenever the URL changes underneath the directory — so the
 * two readings cannot drift into disagreeing about what a link means.
 *
 * Total, like the parsers it delegates to: an absent or malformed param resolves to a usable default rather than to an
 * error, so a hand-edited or truncated link opens the unsearched page at worst.
 *
 * @param params - The query string to read, already parsed.
 * @returns The view the URL asks for.
 */
export function parseBillDirectoryQuery(params: URLSearchParams): BillDirectoryQuery {
  return {
    query: parseQueryFilter(params.get(BILL_DIRECTORY_PARAMS.query)),
    stage: parseBillStageFilter(params.get(BILL_DIRECTORY_PARAMS.stage)),
  };
}

/**
 * Serializes the bill directory's current view back into a query string.
 *
 * Only non-default values are written, so an untouched directory keeps a clean `/bills` URL instead of one carrying
 * params that say "no search, all stages".
 *
 * @param query - The current search text. Trimmed; a blank search contributes nothing.
 * @param stage - The current stage filter.
 * @returns The query string including its leading `?`, or an empty string when nothing is narrowed.
 */
export function billDirectoryQueryString(query: string, stage: BillStageFilter): string {
  const params: URLSearchParams = new URLSearchParams();
  const trimmed: string = query.trim();

  if (trimmed.length > 0) params.set(BILL_DIRECTORY_PARAMS.query, trimmed);
  if (stage !== ANY_FACET) params.set(BILL_DIRECTORY_PARAMS.stage, stage);

  return toQueryString(params);
}

/**
 * Whether `bill` matches free-text `query`.
 *
 * This is the closest approximation of "search" this app can offer: Congress.gov's API has no full-text search endpoint
 * (see `docs/data-policy.md`), so this filters bill metadata already fetched for other purposes rather than querying
 * upstream by keyword. Shared by the server-side sweep (`getSearchResults`) and `BillDirectory`'s client-side fallback
 * for when that route isn't reachable, so both agree on what counts as a match rather than quietly disagreeing.
 *
 * @param bill - The bill to test.
 * @param query - The raw search text. Matched case-insensitively against title, type, number, policy area, and
 *   latest-action text — the same fields the UI already shows, so a match is always visibly explicable.
 * @returns `true` when the bill matches. An empty or all-whitespace query matches everything, which is what makes
 *   "clear the search box" mean "show me everything again".
 */
export function matchesQuery(bill: LegislativeBill, query: string): boolean {
  const normalizedQuery: string = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [bill.title, bill.type, bill.number, bill.policyArea, bill.latestAction.text].some(
    (value: string | undefined): boolean => value?.toLowerCase().includes(normalizedQuery) ?? false,
  );
}

/** A search query recognized as naming one specific bill, rather than a free-text keyword search. */
export type ParsedBillCitation = {
  /** The Congress the citation specified, if any (e.g., the "119" in "119 HR 284"). Absent for a bare "HR 284". */
  congress?: number;
  type: string;
  number: string;
};

/**
 * Recognizes a query that names one specific bill by citation, so search can attempt a fast, exact lookup instead of
 * relying on the broad keyword sweep happening to contain a literal match.
 *
 * @param query - The raw search text. "HR 284", "H.R. 284", "hr284", and "119 hjres 66" all parse, since people write
 *   citations every one of those ways.
 * @returns The parsed citation, or `null` for anything that doesn't cleanly resolve to one of the eight bill/resolution
 *   types followed by a number — including ordinary keyword searches, which is the common case.
 */
export function parseBillCitation(query: string): ParsedBillCitation | null {
  const trimmed: string = query.trim();
  if (!trimmed) return null;

  // An optional leading Congress number ahead of the citation itself, e.g., the "119" in "119 HR 284".
  const congressMatch: RegExpExecArray | null = /^(\d{1,3})[\s-]+(.+)$/.exec(trimmed);
  const congress: number | undefined = congressMatch?.[1] ? Number(congressMatch[1]) : undefined;
  const rest: string = congressMatch?.[2] ?? trimmed;

  // Strips the punctuation and spacing people commonly type around a citation ("H.R. 284", "H. J. Res. 66") down to a
  // bare TYPE+NUMBER token, so every common way of writing one normalizes to the same shape.
  const normalized: string = rest.replace(/[.\s-]/g, "").toUpperCase();
  const citationMatch: RegExpExecArray | null = /^([A-Z]+)(\d{1,6})$/.exec(normalized);
  if (!citationMatch) return null;

  const type: string | undefined = citationMatch[1];
  const number: string | undefined = citationMatch[2];
  if (!type || !number || !BILL_TYPE_CODES.has(type)) return null;

  return congress === undefined ? { type, number } : { congress, type, number };
}
