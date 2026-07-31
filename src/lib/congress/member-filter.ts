import {
  ANY_FACET,
  type FacetFilter,
  type FacetOption,
  parseEnumParam,
  parseQueryFilter,
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
} from "@/lib/congress/members";
import { compareText } from "@/lib/format";

/**
 * The member directory's narrowing rules: free-text matching plus the three facet filters, and the two helpers that
 * derive each facet's options from the roster actually in hand.
 *
 * Pure and isomorphic, exactly as `search.ts` is for bills, and for the same two reasons: the rules are the interesting
 * part and deserve tests that don't render a component, and the browser has to be able to import them without dragging
 * in the server-only adapter — and the API key it reads — behind them.
 *
 * Unlike bill search, none of this needs a request. The roster is bounded (a seated Congress is a little over 540
 * people), the server already sent every row to draw the grid, and Congress.gov offers no member-search parameter to
 * defer to anyway — so filtering happens entirely in the browser, instantly, with no `/api` route between a keystroke
 * and its result. @see docs/decisions.md, "The Member Directory Filters in the Browser".
 *
 * Three things live here beyond the filters themselves, all for the same reason — they are rules, not rendering:
 *
 * - **Ordering** ({@link sortMembers}), so "sorted by party" means one testable thing rather than whatever a component
 *   happened to implement.
 * - **Facet options** ({@link listMemberJurisdictions}, {@link listMemberPartyOptions}), derived from the roster in
 *   hand so a control can never offer a choice that returns nothing.
 * - **The URL spelling of a view** ({@link memberDirectoryQueryString} and the parsers beside it), which is shared
 *   across a boundary — the server reads it out of the request, the browser writes it back — and so belongs to
 *   neither side. @see docs/decisions.md, "A Narrowed Directory Is a Place, So It Has a URL".
 *
 * What this file does *not* declare is the vocabulary every directory narrows itself with — the `ANY_FACET` sentinel,
 * the facet-option shape, the query-length cap, and the total-parser rule all live in `directory-filter.ts`, so the
 * sameness this module shares with `committee-filter.ts` and `search.ts` is structural rather than asserted.
 */

export type ChamberFilter = FacetFilter<CongressChamber>;
export type PartyFilter = FacetFilter<PartyGroup>;
/** A represented jurisdiction by full name (e.g., `"Vermont"`), or {@link ANY_FACET}. */
export type StateFilter = string;

/** The directory's complete narrowing state — everything the controls can express, in one value. */
export type MemberFilters = {
  /** Raw search text, as typed. Trimmed internally. */
  query: string;
  chamber: ChamberFilter;
  party: PartyFilter;
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
 * Whether `entry` matches free-text `query`.
 *
 * Matched against the member's name and the jurisdiction they represent — both the bare state name and the seat as it
 * reads on screen, so "Ohio", "9th district", "at-large", and "non-voting" all find what a person would expect them to.
 * Party is deliberately *not* searched: it has a dedicated filter beside the box, and matching it here would make
 * typing "d" return every Democrat in the chamber alongside everyone whose name happens to contain the letter.
 *
 * @param entry - The directory row to test.
 * @param query - The raw search text. Matched case-insensitively; an empty or all-whitespace query matches everything,
 *   which is what makes clearing the box mean "show me everyone again".
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
 * @returns The matching rows, in the order they arrived — filtering never reorders, so narrowing a list never also
 *   shuffles it under the reader.
 */
export function filterMembers(entries: MemberDirectoryEntry[], filters: MemberFilters): MemberDirectoryEntry[] {
  return entries.filter((entry: MemberDirectoryEntry): boolean => {
    if (filters.chamber !== ANY_FACET && entry.chamber !== filters.chamber) return false;
    if (filters.party !== ANY_FACET && entry.party !== filters.party) return false;
    if (filters.state !== ANY_FACET && entry.state !== filters.state) return false;

    return matchesMemberQuery(entry, filters.query);
  });
}

/**
 * The orders the directory can be read in.
 *
 * Every one of these is an order a person can *state a reason for wanting* — alphabetically, by the place represented,
 * by party, by chamber. The list stays short on purpose: a sort control is only useful if a reader can predict what
 * each option does without trying it.
 */
export const memberSorts = ["name", "name-desc", "state", "party", "chamber"] as const;

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
 * Orders two members by the place they represent, then by seat within it.
 *
 * District order is the useful tiebreak rather than a nicety: a delegation listed 1st, 2nd, 3rd reads as the state's
 * map, while the same names alphabetized reads as nothing in particular. An at-large seat (`district` 0 or absent)
 * sorts first, since it *is* the whole state.
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
 * Orders the roster.
 *
 * Every comparator falls through to {@link compareMembersByName}, so a sort never leaves a group of ties in whatever
 * arbitrary order they happened to arrive in — grouping by party still lists each party alphabetically, and "Name
 * (Z–A)" is the only order that isn't ultimately anchored on the name.
 *
 * @param entries - The rows to order. Left untouched; a new array is returned.
 * @param sort - The order to apply.
 * @returns A newly ordered array.
 */
export function sortMembers(entries: MemberDirectoryEntry[], sort: MemberSort): MemberDirectoryEntry[] {
  const compare: (a: MemberDirectoryEntry, b: MemberDirectoryEntry) => number = MEMBER_SORT_COMPARATORS[sort];

  return [...entries].sort((a: MemberDirectoryEntry, b: MemberDirectoryEntry): number => {
    const primary: number = compare(a, b);
    return primary !== 0 || sort === "name-desc" ? primary : compareMembersByName(a, b);
  });
}

/**
 * One selectable value in a facet control, with the number of members behind it.
 *
 * The shared {@link FacetOption}, re-exported under this directory's own name so the two sites that reach for it —
 * `listMemberJurisdictions` and `listMemberPartyOptions` — read as member-scoped where they are used. @see FacetOption
 * for why every facet option carries a count.
 *
 * @typeParam Value - The filter value this option sets.
 */
export type MemberFacetOption<Value> = FacetOption<Value>;

/**
 * Which group a jurisdiction belongs to in the state control.
 *
 * The split is exactly the six House seats that carry no floor vote (@see isNonVotingJurisdiction), which is what makes
 * it a fact about the chamber rather than an editorial grouping: the five territorial Delegates and Puerto Rico's
 * Resident Commissioner represent the jurisdictions in `"territory"`, and everything else is a state.
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
 * The jurisdictions present in a roster, for the state filter's options.
 *
 * Derived from the roster rather than hard-coded from a list of the fifty states, so the control offers exactly what
 * can actually be selected: territories and the District of Columbia appear because their Delegates do, and nothing is
 * offered that would return an empty grid.
 *
 * Grouped rather than presented as one alphabetical run of fifty-six entries. A flat list interleaves American Samoa,
 * the District of Columbia, Guam, and the rest among the states, so a reader scanning for a state passes items that
 * aren't one, and a reader looking for a territory has no way to find out which are even represented without reading
 * the whole list. The grouping is the same non-voting-seat distinction the chamber diagram already draws.
 *
 * @param entries - The full directory.
 * @returns Every distinct jurisdiction with its member count, alphabetically within its group. Rows with no
 *   jurisdiction on file contribute nothing, since an unnamed place is not a place a reader can choose.
 */
export function listMemberJurisdictions(entries: MemberDirectoryEntry[]): JurisdictionOption[] {
  const counts: Map<string, number> = new Map<string, number>();

  for (const entry of entries) {
    const state: string = (entry.state ?? "").trim();
    if (state.length > 0) counts.set(state, (counts.get(state) ?? 0) + 1);
  }

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
 * The parties present in a roster, for the party filter's options.
 *
 * Ordered by {@link partySeatingOrder} rather than alphabetically or by size, so the control reads in the same
 * left-to-right order as the home page's chamber diagram and its legend — the place most readers will have just seen
 * these same parties. That order is only legible once each option carries its count, which is the other half of why
 * these are {@link MemberFacetOption}s rather than bare values: "Democratic (213), Independent (2), Republican (220)"
 * is plainly the chart's order, while the same three words alone are plainly nothing in particular.
 *
 * @param entries - The full directory.
 * @returns Every party actually holding a seat, in seating order, with its count. A party nobody holds is omitted
 *   rather than offered as an option that can only ever return nothing.
 */
export function listMemberPartyOptions(entries: MemberDirectoryEntry[]): MemberFacetOption<PartyGroup>[] {
  const counts: Map<PartyGroup, number> = new Map<PartyGroup, number>();

  for (const entry of entries) counts.set(entry.party, (counts.get(entry.party) ?? 0) + 1);

  return partySeatingOrder
    .filter((party: PartyGroup): boolean => counts.has(party))
    .map(
      (party: PartyGroup): MemberFacetOption<PartyGroup> => ({
        value: party,
        label: partyGroupLabels[party],
        count: counts.get(party) ?? 0,
      }),
    );
}

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
  filters: MemberFilters;
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
 * Parses the `state` param against the jurisdictions actually in the roster.
 *
 * Validated against the roster rather than accepted as free text, and matched case-insensitively so a hand-typed
 * `?state=ohio` resolves to the roster's own `"Ohio"`. Both halves matter for the same reason: a value the control has
 * no option for would leave the select showing one thing while the grid showed another, which is a worse failure than
 * simply ignoring an unusable param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @param known - The jurisdictions present in the roster. @see listMemberJurisdictions
 * @returns The roster's spelling of the requested jurisdiction, or {@link ANY_FACET} when it isn't one the roster
 *   contains — so a link to a state whose delegation has since changed still opens a usable page.
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
 * Reads a whole directory view out of a URL's query string.
 *
 * The exact counterpart to {@link memberDirectoryQueryString}, and the only thing that turns a `/members` URL into a
 * view. Both sides of the boundary go through it: the route resolves the incoming request with it, and the browser
 * re-reads the address bar with it whenever the URL changes underneath the directory — a soft navigation to another
 * `/members` view, Back or Forward, or a shared link opened on a build with no server to resolve it. One parser means
 * those two readings cannot drift into disagreeing about what a link means.
 *
 * Total, like every parser it delegates to: an absent, malformed, or stale param resolves to a usable default rather
 * than an error, so a hand-edited or year-old link opens the unfiltered page at worst.
 *
 * @param params - The query string to read, already parsed.
 * @param knownJurisdictions - The jurisdictions present in the roster being rendered, so `?state=` can only resolve to
 *   one the control will actually offer. @see parseJurisdictionFilter
 * @returns The view the URL asks for.
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
 * Serializes a directory view back into a query string.
 *
 * Only non-default values are written, so an unnarrowed directory has a clean `/members` URL rather than one carrying
 * four params that all say "no". The parameter order is fixed rather than incidental, so the same view always produces
 * the same string — which is what makes these links comparable, cacheable, and stable in a browser's history.
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
