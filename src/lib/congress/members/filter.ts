import {
  ANY_FACET,
  buildFacetOptions,
  countFacetValues,
  type FacetFilter,
  type FacetOption,
  parseEnumParam,
  parseQueryFilter,
  sortWithTiebreak,
  toQueryString,
} from "@/lib/congress/directory-filter";
import {
  type CongressChamber,
  compareMembersByName,
  congressChambers,
  formatMemberSeat,
  isNonVotingJurisdiction,
  type MemberDirectoryEntry,
  type PartyGroup,
  partyGroupLabels,
  partyGroups,
  partySeatingOrder,
  partySeatingRank,
} from "@/lib/congress/members/model";
import { compareText } from "@/lib/format";

/**
 * The member directory's rules: free-text matching, facet filters, ordering, facet options derived from the roster in
 * hand, and the URL spelling of a view. Pure and isomorphic so it's testable without rendering and the browser can
 * import it. The roster (~540 people) is already on the page, so filtering happens in the browser with no request.
 *
 * The vocabulary shared by every directory (`ANY_FACET`, facet options, query caps, counting) lives in
 * `directory-filter.ts`; this file holds what's specific to members.
 *
 * @see docs/architecture.md, "Bills Search on the Server; Members and Committees Filter in the Browser".
 */

// Filters.

/** The chamber facet's selection: one chamber, or any. */
export type ChamberFilter = FacetFilter<CongressChamber>;

/** The party facet's selection: one party group, or any. */
export type PartyFilter = FacetFilter<PartyGroup>;

/** A represented jurisdiction by full name (e.g., `"Vermont"`), or {@link ANY_FACET}. */
export type StateFilter = string;

/** The directory's complete narrowing state — everything the controls can express, in one value. */
export type MemberFilters = {
  /** Raw search text, as typed. Trimmed internally. */
  query: string;
  /** The chamber to narrow to. */
  chamber: ChamberFilter;
  /** The party to narrow to. */
  party: PartyFilter;
  /** The state or territory to narrow to. */
  state: StateFilter;
};

/** No narrowing at all: the directory's initial state, and what "Clear Filters" restores. */
export const NO_MEMBER_FILTERS: MemberFilters = {
  query: "",
  chamber: ANY_FACET,
  party: ANY_FACET,
  state: ANY_FACET,
};

/**
 * Whether any filter is actually narrowing the list.
 *
 * @param filters - The current filter state.
 * @returns `true` when at least one facet is set or the search box has non-whitespace text — which is what decides
 *   whether a "Clear Filters" control has anything to do, so it can be offered only when it does.
 */
export function hasActiveMemberFilters(filters: MemberFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.chamber !== ANY_FACET ||
    filters.party !== ANY_FACET ||
    filters.state !== ANY_FACET
  );
}

/**
 * Whether `entry` matches free-text `query`: the name, the state, and the seat as displayed ("9th district",
 * "at-large", "non-voting"). Party isn't searched — it has its own filter, and "d" would match every Democrat.
 *
 * @param entry - The directory row to test.
 * @param query - The raw search text, case-insensitive; blank matches everything.
 * @returns `true` when the row matches.
 */
export function matchesMemberQuery(entry: MemberDirectoryEntry, query: string): boolean {
  const normalizedQuery: string = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [entry.name, entry.state, formatMemberSeat(entry, entry.chamber)].some((value: string | undefined): boolean =>
    Boolean(value?.toLowerCase().includes(normalizedQuery)),
  );
}

/**
 * Applies every filter to the roster.
 *
 * @param entries - The full directory, already ordered by the server.
 * @param filters - The current filter state.
 * @returns The matching rows, in their original order.
 */
export function filterMembers(entries: MemberDirectoryEntry[], filters: MemberFilters): MemberDirectoryEntry[] {
  return entries.filter((entry: MemberDirectoryEntry): boolean => {
    if (filters.chamber !== ANY_FACET && entry.chamber !== filters.chamber) return false;
    if (filters.party !== ANY_FACET && entry.party !== filters.party) return false;
    if (filters.state !== ANY_FACET && entry.state !== filters.state) return false;

    return matchesMemberQuery(entry, filters.query);
  });
}

// Sorts.

/**
 * The orders the directory can be read in.
 *
 * Every one of these is an order a person can *state a reason for wanting* — alphabetically, by the place represented,
 * by party, by chamber. The list stays short on purpose: a sort control is only useful if a reader can predict what
 * each option does without trying it.
 */
export const memberSorts = ["name", "name-desc", "state", "party", "chamber"] as const;

/** One of the {@link memberSorts}. */
export type MemberSort = (typeof memberSorts)[number];

/** The order the roster arrives in from the server, and what the sort control resets to. */
export const DEFAULT_MEMBER_SORT: MemberSort = "name";

/** How each sort option reads on screen. */
export const memberSortLabels: Record<MemberSort, string> = {
  name: "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  state: "State or Territory",
  party: "Party",
  chamber: "Chamber",
};

/**
 * Orders two members by the place they represent, then by district, with an at-large seat (`district` 0 or absent)
 * first.
 *
 * @param a - One member to compare.
 * @param b - The other member to compare.
 * @returns A standard comparator result. Members with no jurisdiction on file sort last, together.
 */
function compareByJurisdiction(a: MemberDirectoryEntry, b: MemberDirectoryEntry): number {
  const stateA: string = a.state ?? "";
  const stateB: string = b.state ?? "";

  // An empty jurisdiction would otherwise sort ahead of "Alabama", putting the least informative rows first.
  if (stateA !== stateB) {
    if (stateA.length === 0) return 1;
    if (stateB.length === 0) return -1;
    return compareText(stateA, stateB);
  }

  return (a.district ?? 0) - (b.district ?? 0);
}

/** The comparators behind each {@link MemberSort}, before the alphabetical tiebreak every one of them falls back to. */
const MEMBER_SORT_COMPARATORS: Record<MemberSort, (a: MemberDirectoryEntry, b: MemberDirectoryEntry) => number> = {
  name: (): number => 0,
  "name-desc": (a: MemberDirectoryEntry, b: MemberDirectoryEntry): number => compareMembersByName(b, a),
  state: compareByJurisdiction,
  party: (a: MemberDirectoryEntry, b: MemberDirectoryEntry): number =>
    partySeatingRank(a.party) - partySeatingRank(b.party),
  chamber: (a: MemberDirectoryEntry, b: MemberDirectoryEntry): number =>
    congressChambers.indexOf(a.chamber) - congressChambers.indexOf(b.chamber),
};

/**
 * Orders the roster. Every order breaks ties by {@link compareMembersByName}, so grouping by party still lists each
 * party alphabetically.
 *
 * @param entries - The rows to order. Left untouched; a new array is returned.
 * @param sort - The order to apply.
 * @returns A newly ordered array.
 */
export function sortMembers(entries: MemberDirectoryEntry[], sort: MemberSort): MemberDirectoryEntry[] {
  return sortWithTiebreak(entries, MEMBER_SORT_COMPARATORS[sort], compareMembersByName);
}

// Facet options.

/**
 * One selectable facet value with its member count — {@link FacetOption} under a member-scoped name.
 *
 * @typeParam Value - The filter value this option sets.
 */
export type MemberFacetOption<Value> = FacetOption<Value>;

/**
 * Which group a jurisdiction belongs to in the state control.
 *
 * The split is exactly the six House seats that carry no floor vote (see {@link isNonVotingJurisdiction}), which is
 * what makes it a fact about the chamber rather than an editorial grouping: the five territorial Delegates and Puerto
 * Rico's Resident Commissioner represent the jurisdictions in `"territory"`, and everything else is a state.
 */
export type JurisdictionGroup = "state" | "territory";

/** A jurisdiction option, carrying the group its `<optgroup>` belongs under. */
export type JurisdictionOption = MemberFacetOption<string> & { group: JurisdictionGroup };

/** Headings for each jurisdiction group, so the control names its own grouping rather than implying it. */
export const jurisdictionGroupLabels: Record<JurisdictionGroup, string> = {
  state: "States",
  territory: "Territories and Federal District",
};

/**
 * The jurisdictions present in a roster, for the state filter — derived from the roster so nothing offered returns an
 * empty grid. Grouped into states and non-voting jurisdictions so territories don't interleave with states.
 *
 * @param entries - The full directory.
 * @returns Every distinct jurisdiction with its count, alphabetical within its group. Rows without one are skipped.
 */
export function listMemberJurisdictions(entries: MemberDirectoryEntry[]): JurisdictionOption[] {
  // The one facet in the app whose values are not a union the model declares, so it counts and then orders the values
  // it found rather than filtering a declared order down. See buildFacetOptions, which the other two facets use.
  const counts: Map<string, number> = countFacetValues(entries, (entry: MemberDirectoryEntry): string | undefined => {
    const state: string = (entry.state ?? "").trim();
    return state.length > 0 ? state : undefined;
  });

  return [...counts.entries()]
    .map(
      ([state, count]: [string, number]): JurisdictionOption => ({
        value: state,
        label: state,
        count,
        group: isNonVotingJurisdiction(state) ? "territory" : "state",
      }),
    )
    .sort((a: JurisdictionOption, b: JurisdictionOption): number => compareText(a.label, b.label));
}

/**
 * The parties present in a roster, for the party filter, in {@link partySeatingOrder} to match the chamber diagram.
 *
 * @param entries - The full directory.
 * @returns Every party holding a seat, in seating order, with its count.
 */
export function listMemberPartyOptions(entries: MemberDirectoryEntry[]): MemberFacetOption<PartyGroup>[] {
  return buildFacetOptions(
    entries,
    (entry: MemberDirectoryEntry): PartyGroup => entry.party,
    partySeatingOrder,
    (party: PartyGroup): string => partyGroupLabels[party],
  );
}

// The shareable URL.

/**
 * The query-param names the directory reads and writes.
 *
 * Named once, here, because they are shared across a boundary that is easy to break silently: the server route parses
 * them out of the request, and the client component writes them back as the reader narrows. A typo on either side
 * produces a link that looks right and restores nothing.
 */
export const MEMBER_DIRECTORY_PARAMS = {
  query: "q",
  chamber: "chamber",
  party: "party",
  state: "state",
  sort: "sort",
} as const;

/** Everything the `/members` URL can express: what to show, and in what order. */
export type MemberDirectoryQuery = {
  /** What to show. */
  filters: MemberFilters;
  /** The order to show it in. */
  sort: MemberSort;
};

/** An unfiltered directory in its default order — what a bare `/members` means. */
export const DEFAULT_MEMBER_DIRECTORY_QUERY: MemberDirectoryQuery = {
  filters: NO_MEMBER_FILTERS,
  sort: DEFAULT_MEMBER_SORT,
};

/**
 * Parses the `chamber` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The chamber, or {@link ANY_FACET} for anything unrecognized — a hand-edited or stale URL degrades to "both
 *   chambers" rather than to an error or an empty grid, the same contract `src/lib/api-query.ts` holds its params to.
 */
export function parseChamberFilter(raw: string | null | undefined): ChamberFilter {
  return parseEnumParam(raw, congressChambers, ANY_FACET);
}

/**
 * Parses the `party` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The party group, or {@link ANY_FACET} for anything unrecognized.
 */
export function parsePartyFilter(raw: string | null | undefined): PartyFilter {
  return parseEnumParam(raw, partyGroups, ANY_FACET);
}

/**
 * Parses the `sort` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The requested order, or {@link DEFAULT_MEMBER_SORT} for anything unrecognized.
 */
export function parseMemberSort(raw: string | null | undefined): MemberSort {
  return parseEnumParam(raw, memberSorts, DEFAULT_MEMBER_SORT);
}

/**
 * Parses the `state` param against the roster's jurisdictions, case-insensitively (`?state=ohio` → `"Ohio"`), so the
 * select and the grid can't disagree.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @param known - The jurisdictions present in the roster.
 * @returns The roster's spelling, or {@link ANY_FACET} when the roster doesn't contain it.
 * @see listMemberJurisdictions
 */
export function parseJurisdictionFilter(raw: string | null | undefined, known: Iterable<string>): StateFilter {
  const wanted: string = (raw ?? "").trim().toLowerCase();
  if (wanted.length === 0) return ANY_FACET;

  for (const candidate of known) {
    if (candidate.toLowerCase() === wanted) return candidate;
  }

  return ANY_FACET;
}

/**
 * Reads a directory view out of a URL's query string — the inverse of {@link memberDirectoryQueryString}, used by both
 * the server and the browser. Total: anything absent, malformed, or stale resolves to a default.
 *
 * @param params - The query string to read, already parsed.
 * @param knownJurisdictions - The jurisdictions present in the roster being rendered, so `?state=` can only resolve to
 *   one the control will actually offer.
 * @returns The view the URL asks for.
 * @see parseJurisdictionFilter
 */
export function parseMemberDirectoryQuery(
  params: URLSearchParams,
  knownJurisdictions: Iterable<string>,
): MemberDirectoryQuery {
  return {
    filters: {
      query: parseQueryFilter(params.get(MEMBER_DIRECTORY_PARAMS.query)),
      chamber: parseChamberFilter(params.get(MEMBER_DIRECTORY_PARAMS.chamber)),
      party: parsePartyFilter(params.get(MEMBER_DIRECTORY_PARAMS.party)),
      state: parseJurisdictionFilter(params.get(MEMBER_DIRECTORY_PARAMS.state), knownJurisdictions),
    },
    sort: parseMemberSort(params.get(MEMBER_DIRECTORY_PARAMS.sort)),
  };
}

/**
 * Serializes a directory view back into a query string, writing only non-default values in a fixed order so each view
 * has exactly one URL.
 *
 * @param query - The view to serialize.
 * @returns The query string including its leading `?`, or an empty string when nothing is narrowed or reordered.
 */
export function memberDirectoryQueryString(query: MemberDirectoryQuery): string {
  const params: URLSearchParams = new URLSearchParams();
  const trimmedQuery: string = query.filters.query.trim();

  if (trimmedQuery.length > 0) params.set(MEMBER_DIRECTORY_PARAMS.query, trimmedQuery);
  if (query.filters.chamber !== ANY_FACET) params.set(MEMBER_DIRECTORY_PARAMS.chamber, query.filters.chamber);
  if (query.filters.party !== ANY_FACET) params.set(MEMBER_DIRECTORY_PARAMS.party, query.filters.party);
  if (query.filters.state !== ANY_FACET) params.set(MEMBER_DIRECTORY_PARAMS.state, query.filters.state);
  if (query.sort !== DEFAULT_MEMBER_SORT) params.set(MEMBER_DIRECTORY_PARAMS.sort, query.sort);

  return toQueryString(params);
}
