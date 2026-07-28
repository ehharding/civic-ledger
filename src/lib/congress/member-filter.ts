import {
  type CongressChamber,
  formatMemberSeat,
  type MemberDirectoryEntry,
  type PartyGroup,
  partySeatingOrder,
} from "@/lib/congress/members";

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
 */

/** The wildcard value each facet filter uses for "don't narrow on this at all". */
export const ANY_FACET = "all" as const;

export type ChamberFilter = CongressChamber | typeof ANY_FACET;
export type PartyFilter = PartyGroup | typeof ANY_FACET;
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
 * The jurisdictions present in a roster, for the state filter's options.
 *
 * Derived from the roster rather than hard-coded from a list of the fifty states, so the control offers exactly what
 * can actually be selected: territories and the District of Columbia appear because their Delegates do, and nothing is
 * offered that would return an empty grid.
 *
 * @param entries - The full directory.
 * @returns Every distinct jurisdiction, alphabetically. Rows with no jurisdiction on file contribute nothing.
 */
export function listMemberStates(entries: MemberDirectoryEntry[]): string[] {
  const states: Set<string> = new Set<string>();

  for (const entry of entries) {
    const state: string = (entry.state ?? "").trim();
    if (state.length > 0) states.add(state);
  }

  return [...states].sort((a: string, b: string): number => a.localeCompare(b));
}

/**
 * The parties present in a roster, for the party filter's options.
 *
 * Ordered by {@link partySeatingOrder} rather than alphabetically, so the control reads in the same left-to-right order
 * as the home page's chamber diagram and its legend — the place most readers will have just seen these same parties.
 *
 * @param entries - The full directory.
 * @returns Every party actually holding a seat, in seating order. A party nobody holds is omitted rather than offered
 *   as an option that can only ever return nothing.
 */
export function listMemberParties(entries: MemberDirectoryEntry[]): PartyGroup[] {
  const present: Set<PartyGroup> = new Set<PartyGroup>(
    entries.map((entry: MemberDirectoryEntry): PartyGroup => entry.party),
  );

  return partySeatingOrder.filter((party: PartyGroup): boolean => present.has(party));
}
