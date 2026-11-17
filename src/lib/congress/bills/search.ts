import { BILL_TYPE_CODES, type BillStage, billStages, type LegislativeBill } from "@/lib/congress/bills/model";
import {
  ANY_FACET,
  type FacetFilter,
  parseEnumParam,
  parseQueryFilter,
  toQueryString,
} from "@/lib/congress/directory-filter";

// The shareable URL.

/** The stage control's selection: one of the five legislative stages, or {@link ANY_FACET}. */
export type BillStageFilter = FacetFilter<BillStage>;

/** The query-param names the bill directory reads (on the server) and writes (in the browser). */
export const BILL_DIRECTORY_PARAMS = {
  query: "q",
  stage: "stage",
} as const;

/** Everything the `/bills` URL can express: what to search for, and which stage to narrow to. */
export type BillDirectoryQuery = {
  /** The free-text search, or `""`. */
  query: string;
  /** The stage to narrow to. */
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
 * Reads a directory view out of a URL's query string — the inverse of {@link billDirectoryQueryString}, used by both
 * the route and the browser so they agree on what a link means. Total: a malformed param resolves to its default.
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
 * Serializes the bill directory's current view into a query string, writing only non-default values.
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

// Matching a search.

/**
 * Whether `bill` matches free-text `query`. Congress.gov has no full-text search, so this filters fetched metadata;
 * shared by the server sweep (`getSearchResults`) and `BillDirectory`'s client-side fallback so both agree.
 *
 * @param bill - The bill to test.
 * @param query - The raw search text, matched case-insensitively against title, type, number, policy area, and
 *   latest-action text — fields the UI shows, so a match is always visible.
 * @returns `true` when the bill matches. A blank query matches everything.
 */
export function matchesQuery(bill: LegislativeBill, query: string): boolean {
  const normalizedQuery: string = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [bill.title, bill.type, bill.number, bill.policyArea, bill.latestAction.text].some(
    (value: string | undefined): boolean => value?.toLowerCase().includes(normalizedQuery) ?? false,
  );
}

// Reading a bill citation out of a search.

/** A search query recognized as naming one specific bill, rather than a free-text keyword search. */
export type ParsedBillCitation = {
  /** The Congress the citation specified, if any (e.g., the "119" in "119 HR 284"). Absent for a bare "HR 284". */
  congress?: number;
  /** The upper-case bill type code, e.g., `"HR"` or `"HJRES"`. */
  type: string;
  /** The bill number, as typed. */
  number: string;
};

/**
 * Recognizes a query that names one bill by citation, so search can try an exact lookup before the keyword sweep.
 *
 * @param query - The raw search text. "HR 284", "H.R. 284", "hr284", and "119 hjres 66" all parse, since people write
 *   citations every one of those ways.
 * @returns The parsed citation, or `null` for anything else, including ordinary keyword searches.
 */
export function parseBillCitation(query: string): ParsedBillCitation | null {
  const trimmed: string = query.trim();
  if (!trimmed) return null;

  // An optional leading Congress number ahead of the citation itself, e.g., the "119" in "119 HR 284".
  const congressMatch: RegExpExecArray | null = /^(\d{1,3})[\s-]+(.+)$/.exec(trimmed);
  const congress: number | undefined = congressMatch?.[1] ? Number(congressMatch[1]) : undefined;
  const rest: string = congressMatch?.[2] ?? trimmed;

  // Normalizes "H.R. 284", "H. J. Res. 66", etc. to a bare TYPE+NUMBER token.
  const normalized: string = rest.replace(/[.\s-]/g, "").toUpperCase();
  const citationMatch: RegExpExecArray | null = /^([A-Z]+)(\d{1,6})$/.exec(normalized);
  if (!citationMatch) return null;

  const type: string | undefined = citationMatch[1];
  const number: string | undefined = citationMatch[2];
  if (!type || !number || !BILL_TYPE_CODES.has(type)) return null;

  return congress === undefined ? { type, number } : { congress, type, number };
}
