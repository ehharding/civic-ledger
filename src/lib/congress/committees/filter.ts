import {
  type CommitteeChamber,
  type CommitteeSummary,
  type CommitteeType,
  committeeChambers,
  committeeSearchTerms,
  committeeTypeLabels,
  committeeTypes,
  compareCommitteesByName,
} from "@/lib/congress/committees/model";
import {
  ANY_FACET,
  buildFacetOptions,
  type FacetFilter,
  type FacetOption,
  parseEnumParam,
  parseQueryFilter,
  sortWithTiebreak,
  toQueryString,
} from "@/lib/congress/directory-filter";

/**
 * The committee directory's rules: free-text matching, two facet filters, ordering, and the URL spelling of a view.
 * Pure and isomorphic, and the same design as `members/filter.ts`, with the shared vocabulary in `directory-filter.ts`.
 */

export type CommitteeChamberFilter = FacetFilter<CommitteeChamber>;
export type CommitteeTypeFilter = FacetFilter<CommitteeType>;

/** The directory's complete narrowing state — everything the controls can express, in one value. */
export type CommitteeFilters = {
  /** Raw search text, as typed. Trimmed internally. */
  query: string;
  /** The chamber to narrow to. */
  chamber: CommitteeChamberFilter;
  /** The committee type to narrow to. */
  type: CommitteeTypeFilter;
};

/** No narrowing at all: the directory's initial state, and what "Clear Filters" restores. */
export const NO_COMMITTEE_FILTERS: CommitteeFilters = {
  query: "",
  chamber: ANY_FACET,
  type: ANY_FACET,
};

/**
 * Whether any filter is actually narrowing the list.
 *
 * @param filters - The current filter state.
 * @returns `true` when at least one facet is set or the search box has non-whitespace text — which is what decides
 *   whether a "Clear Filters" control has anything to do, so it can be offered only when it does.
 */
export function hasActiveCommitteeFilters(filters: CommitteeFilters): boolean {
  return filters.query.trim().length > 0 || filters.chamber !== ANY_FACET || filters.type !== ANY_FACET;
}

/**
 * Whether `committee` matches free-text `query`, against both name forms (@see committeeSearchTerms). Chamber and type
 * aren't searched — they have their own controls, and "s" would match every Senate and Standing committee.
 *
 * @param committee - The row to test.
 * @param query - The raw search text, case-insensitive; blank matches everything.
 * @returns `true` when the row matches.
 */
export function matchesCommitteeQuery(committee: CommitteeSummary, query: string): boolean {
  const normalizedQuery: string = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return committeeSearchTerms(committee.name).some((term: string): boolean => term.includes(normalizedQuery));
}

/**
 * Applies every filter to the list.
 *
 * @param committees - The full directory, already ordered by the server.
 * @param filters - The current filter state.
 * @returns The matching rows, in their original order.
 */
export function filterCommittees(committees: CommitteeSummary[], filters: CommitteeFilters): CommitteeSummary[] {
  return committees.filter((committee: CommitteeSummary): boolean => {
    if (filters.chamber !== ANY_FACET && committee.chamber !== filters.chamber) return false;
    if (filters.type !== ANY_FACET && committee.type !== filters.type) return false;

    return matchesCommitteeQuery(committee, filters.query);
  });
}

/**
 * The orders the directory can be read in.
 *
 * Kept short on the same principle the member sorts are: every option here is one a reader can state a reason for
 * wanting, and can predict the result of without trying it.
 */
export const committeeSorts = ["name", "name-desc", "chamber", "type"] as const;

export type CommitteeSort = (typeof committeeSorts)[number];

/** The order the list arrives in from the server, and what the sort control resets to. */
export const DEFAULT_COMMITTEE_SORT: CommitteeSort = "name";

/** How each sort option reads on screen. */
export const committeeSortLabels: Record<CommitteeSort, string> = {
  name: "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  chamber: "Chamber",
  type: "Committee Type",
};

/** The comparators behind each {@link CommitteeSort}, before the alphabetical tiebreak every one of them falls to. */
const COMMITTEE_SORT_COMPARATORS: Record<CommitteeSort, (a: CommitteeSummary, b: CommitteeSummary) => number> = {
  name: (): number => 0,
  "name-desc": (a: CommitteeSummary, b: CommitteeSummary): number => compareCommitteesByName(b, a),
  chamber: (a: CommitteeSummary, b: CommitteeSummary): number =>
    committeeChambers.indexOf(a.chamber) - committeeChambers.indexOf(b.chamber),
  type: (a: CommitteeSummary, b: CommitteeSummary): number =>
    committeeTypes.indexOf(a.type) - committeeTypes.indexOf(b.type),
};

/**
 * Orders the directory, breaking ties by {@link compareCommitteesByName}.
 *
 * @param committees - The rows to order. Left untouched; a new array is returned.
 * @param sort - The order to apply.
 * @returns A newly ordered array.
 */
export function sortCommittees(committees: CommitteeSummary[], sort: CommitteeSort): CommitteeSummary[] {
  return sortWithTiebreak(committees, COMMITTEE_SORT_COMPARATORS[sort], compareCommitteesByName);
}

/**
 * One selectable facet value with its committee count — {@link FacetOption} under a committee-scoped name.
 *
 * @typeParam Value - The filter value this option sets.
 */
export type CommitteeFacetOption<Value> = FacetOption<Value>;

/**
 * The committee types present in a list, for the type filter, in {@link committeeTypes} order (standing first, "other"
 * last).
 *
 * @param committees - The full directory.
 * @returns Every type actually present, with its count.
 */
export function listCommitteeTypeOptions(committees: CommitteeSummary[]): CommitteeFacetOption<CommitteeType>[] {
  return buildFacetOptions(
    committees,
    (committee: CommitteeSummary): CommitteeType => committee.type,
    committeeTypes,
    (type: CommitteeType): string => committeeTypeLabels[type],
  );
}

/**
 * The query-param names the directory reads and writes.
 *
 * Named once, here, because they are shared across a boundary that is easy to break silently: the route parses them out
 * of the request, and the client component writes them back as the reader narrows. A typo on either side produces a
 * link that looks right and restores nothing.
 */
export const COMMITTEE_DIRECTORY_PARAMS = {
  query: "q",
  chamber: "chamber",
  type: "type",
  sort: "sort",
} as const;

/** Everything the `/committees` URL can express: what to show, and in what order. */
export type CommitteeDirectoryQuery = {
  /** What to show. */
  filters: CommitteeFilters;
  /** The order to show it in. */
  sort: CommitteeSort;
};

/** An unfiltered directory in its default order — what a bare `/committees` means. */
export const DEFAULT_COMMITTEE_DIRECTORY_QUERY: CommitteeDirectoryQuery = {
  filters: NO_COMMITTEE_FILTERS,
  sort: DEFAULT_COMMITTEE_SORT,
};

/**
 * Parses the `chamber` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The chamber, or {@link ANY_FACET} for anything unrecognized — a hand-edited or stale URL degrades to "every
 *   chamber" rather than to an error or an empty grid.
 */
export function parseCommitteeChamberFilter(raw: string | null | undefined): CommitteeChamberFilter {
  return parseEnumParam(raw, committeeChambers, ANY_FACET);
}

/**
 * Parses the `type` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The committee type, or {@link ANY_FACET} for anything unrecognized.
 */
export function parseCommitteeTypeFilter(raw: string | null | undefined): CommitteeTypeFilter {
  return parseEnumParam(raw, committeeTypes, ANY_FACET);
}

/**
 * Parses the `sort` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The requested order, or {@link DEFAULT_COMMITTEE_SORT} for anything unrecognized.
 */
export function parseCommitteeSort(raw: string | null | undefined): CommitteeSort {
  return parseEnumParam(raw, committeeSorts, DEFAULT_COMMITTEE_SORT);
}

/**
 * Reads a directory view out of a URL's query string — the inverse of {@link committeeDirectoryQueryString}, used by
 * both the server and the browser. Total: anything absent, malformed, or stale resolves to a default.
 *
 * @param params - The query string to read, already parsed.
 * @returns The view the URL asks for.
 */
export function parseCommitteeDirectoryQuery(params: URLSearchParams): CommitteeDirectoryQuery {
  return {
    filters: {
      query: parseQueryFilter(params.get(COMMITTEE_DIRECTORY_PARAMS.query)),
      chamber: parseCommitteeChamberFilter(params.get(COMMITTEE_DIRECTORY_PARAMS.chamber)),
      type: parseCommitteeTypeFilter(params.get(COMMITTEE_DIRECTORY_PARAMS.type)),
    },
    sort: parseCommitteeSort(params.get(COMMITTEE_DIRECTORY_PARAMS.sort)),
  };
}

/**
 * Serializes a directory view back into a query string, writing only non-default values in a fixed order so each view
 * has exactly one URL.
 *
 * @param query - The view to serialize.
 * @returns The query string including its leading `?`, or an empty string when nothing is narrowed or reordered.
 */
export function committeeDirectoryQueryString(query: CommitteeDirectoryQuery): string {
  const params: URLSearchParams = new URLSearchParams();
  const trimmedQuery: string = query.filters.query.trim();

  if (trimmedQuery.length > 0) params.set(COMMITTEE_DIRECTORY_PARAMS.query, trimmedQuery);
  if (query.filters.chamber !== ANY_FACET) {
    params.set(COMMITTEE_DIRECTORY_PARAMS.chamber, query.filters.chamber);
  }
  if (query.filters.type !== ANY_FACET) params.set(COMMITTEE_DIRECTORY_PARAMS.type, query.filters.type);
  if (query.sort !== DEFAULT_COMMITTEE_SORT) params.set(COMMITTEE_DIRECTORY_PARAMS.sort, query.sort);

  return toQueryString(params);
}
