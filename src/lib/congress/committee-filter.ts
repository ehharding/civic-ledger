import {
  type CommitteeChamber,
  type CommitteeSummary,
  type CommitteeType,
  committeeChambers,
  committeeSearchTerms,
  committeeTypeLabels,
  committeeTypes,
  compareCommitteesByName,
} from "@/lib/congress/committees";
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
 * The committee directory's narrowing rules: free-text matching, the two facet filters, the orders the list can be read
 * in, and the URL spelling of a view.
 *
 * Pure and isomorphic, exactly as `member-filter.ts` is, and for the same two reasons: the rules are the interesting
 * part and deserve tests that don't render a component, and the browser has to import them without dragging the
 * server-only adapter — and the API key it reads — in behind them.
 *
 * This is deliberately the *same* design as the member directory's rather than a new one. A reader who has narrowed one
 * directory should find the next one already familiar, and a maintainer who has read one of these modules should
 * recognize the second immediately: same wildcard sentinel, same facet-option shape, same total parsers, same
 * only-write-what-isn't-default serialization. Where this one is smaller — two facets rather than three — it is because
 * a committee has fewer facts worth filtering on, not because it took a different approach.
 *
 * All of those shared things come from `directory-filter.ts` rather than being declared again here — the sentinel, the
 * facet-option shape, the total parsers, the query-string tail, and the counting and ordering machinery the type facet
 * and the sorts are built from — so that sameness is something the type system holds rather than something this
 * paragraph promises. What stays here is what is genuinely about *committees*.
 */

export type CommitteeChamberFilter = FacetFilter<CommitteeChamber>;
export type CommitteeTypeFilter = FacetFilter<CommitteeType>;

/** The directory's complete narrowing state — everything the controls can express, in one value. */
export type CommitteeFilters = {
  /** Raw search text, as typed. Trimmed internally. */
  query: string;
  chamber: CommitteeChamberFilter;
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
 * Whether `committee` matches free-text `query`.
 *
 * Matched against both spellings of the name — Congress.gov's own `"Agriculture Committee"` and the leading form
 * `"Committee on Agriculture"` that a bill's referral line uses — so a reader who types what they see on the card and a
 * reader who pastes a referral line off a bill page both find the same committee. @see committeeSearchTerms, which
 * explains why that second form is matched but never displayed.
 *
 * Chamber and type are deliberately *not* searched: each has a dedicated control beside the box, and matching them here
 * would make typing "s" return every Senate and every Standing committee alongside everything whose name happens to
 * contain the letter.
 *
 * @param committee - The row to test.
 * @param query - The raw search text. Matched case-insensitively; an empty or all-whitespace query matches everything,
 *   which is what makes clearing the box mean "show me everything again".
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
 * @returns The matching rows, in the order they arrived — filtering never reorders, so narrowing a list never also
 *   shuffles it under the reader.
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
 * Orders the directory.
 *
 * Every comparator falls through to {@link compareCommitteesByName}, so grouping by chamber still lists each chamber
 * alphabetically rather than in whatever arbitrary order the group happened to arrive in. "Name (Z–A)" needs no
 * exemption from that fallback: names that tie descending tie ascending too.
 *
 * @param committees - The rows to order. Left untouched; a new array is returned.
 * @param sort - The order to apply.
 * @returns A newly ordered array.
 */
export function sortCommittees(committees: CommitteeSummary[], sort: CommitteeSort): CommitteeSummary[] {
  return sortWithTiebreak(committees, COMMITTEE_SORT_COMPARATORS[sort], compareCommitteesByName);
}

/**
 * One selectable value in a facet control, with the number of committees behind it.
 *
 * The shared {@link FacetOption}, re-exported under this directory's own name so {@link listCommitteeTypeOptions} reads
 * as committee-scoped where it is used. @see FacetOption for why every facet option carries a count.
 *
 * @typeParam Value - The filter value this option sets.
 */
export type CommitteeFacetOption<Value> = FacetOption<Value>;

/**
 * The committee types present in a list, for the type filter's options.
 *
 * Ordered by the declaration order of {@link committeeTypes} — standing first, residual "other" last — rather than
 * alphabetically or by size, so the control reads from the most consequential kind of committee to the least. Derived
 * from the list in hand, so the control can never offer a choice that returns nothing.
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
  filters: CommitteeFilters;
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
 * Reads a whole directory view out of a URL's query string.
 *
 * The exact counterpart to {@link committeeDirectoryQueryString}. Both sides of the boundary go through it — the route
 * resolves the incoming request with it, and the browser re-reads the address bar with it whenever the URL changes
 * underneath the directory — so the two readings cannot drift into disagreeing about what a link means.
 *
 * Total, like every parser it delegates to: an absent, malformed, or stale param resolves to a usable default rather
 * than an error, so a hand-edited or year-old link opens the unfiltered page at worst.
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
 * Serializes a directory view back into a query string.
 *
 * Only non-default values are written, so an unnarrowed directory has a clean `/committees` URL rather than one
 * carrying three params that all say "no". The parameter order is fixed rather than incidental, so the same view always
 * produces the same string — which is what makes these links comparable, cacheable, and stable in history.
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
