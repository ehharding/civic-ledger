"use client";

import { ArrowDownUp, Search, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, type JSX, useEffect, useMemo, useState } from "react";

import { MemberCard } from "@/components/member-card";
import {
  ANY_FACET,
  type ChamberFilter,
  DEFAULT_MEMBER_DIRECTORY_QUERY,
  DEFAULT_MEMBER_SORT,
  filterMembers,
  hasActiveMemberFilters,
  type JurisdictionGroup,
  type JurisdictionOption,
  jurisdictionGroupLabels,
  listMemberJurisdictions,
  listMemberPartyOptions,
  type MemberDirectoryQuery,
  type MemberFacetOption,
  type MemberFilters,
  type MemberSort,
  memberDirectoryQueryString,
  memberSortLabels,
  memberSorts,
  NO_MEMBER_FILTERS,
  type PartyFilter,
  sortMembers,
} from "@/lib/congress/member-filter";
import {
  type CongressChamber,
  chamberShortLabels,
  congressChambers,
  type MemberDirectoryEntry,
  type PartyGroup,
} from "@/lib/congress/members";
import type { CongressSnapshot } from "@/lib/congress/types";
import { formatOrdinal, pluralize } from "@/lib/format";

/** The chamber control's options: both chambers, preceded by the "no filter" choice. */
const CHAMBER_OPTIONS: readonly ChamberFilter[] = [ANY_FACET, ...congressChambers];

/** The order jurisdiction groups appear in the state control. */
const JURISDICTION_GROUPS: readonly JurisdictionGroup[] = ["state", "territory"];

/** Props for {@link MemberDirectory}. */
type MemberDirectoryProps = {
  /** The complete roster, already ordered server-side. */
  members: MemberDirectoryEntry[];
  /** The Congress this roster describes, named in the scope note. */
  congress: number;
  /** Whether these are live Congress.gov records or labeled placeholders. Changes the scope note's claim. */
  source: CongressSnapshot["source"];
  /**
   * The view the URL asked for, resolved server-side so a shared link renders narrowed on its very first paint rather
   * than flashing the whole roster and then filtering it. Defaults to the unfiltered directory.
   * @see resolveMemberDirectoryQuery
   */
  initialQuery?: MemberDirectoryQuery;
};

/**
 * Renders the jurisdiction control's options, grouped into states and territories.
 *
 * @param options - Every jurisdiction in the roster, already ordered. @see listMemberJurisdictions
 * @returns One `<optgroup>` per group that has any members in it — an empty group is omitted rather than rendered as a
 *   heading with nothing under it, which is the ordinary case for a Senate-only filtered roster.
 */
function JurisdictionOptions({ options }: { options: JurisdictionOption[] }): JSX.Element {
  return (
    <>
      {JURISDICTION_GROUPS.map((group: JurisdictionGroup): JSX.Element | null => {
        const inGroup: JurisdictionOption[] = options.filter(
          (option: JurisdictionOption): boolean => option.group === group,
        );
        if (inGroup.length === 0) return null;

        return (
          <optgroup key={group} label={jurisdictionGroupLabels[group]}>
            {inGroup.map(
              (option: JurisdictionOption): JSX.Element => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ),
            )}
          </optgroup>
        );
      })}
    </>
  );
}

/**
 * Browsable directory of everyone serving in a Congress.
 *
 * Every narrowing here happens in the browser against the roster the server already sent — no request per keystroke, no
 * debounce, no loading state, and nothing to go wrong offline or in the static export. That is possible because a
 * Congress is a bounded list of a few hundred people; the bill directory cannot work this way, and its very different
 * shape (debounced fetches to a server-side sweep) is a consequence of that, not a difference in taste.
 * @see filterMembers for the rules themselves, and sortMembers for the orders they can be read in.
 *
 * The current view is mirrored into the address bar as the reader narrows, so any state of this page can be linked,
 * bookmarked, or reopened. @see the note on the effect below for why that is `history.replaceState` rather than a
 * router navigation.
 *
 * @param props - @see MemberDirectoryProps
 * @returns The search, facet, and sort controls, the result count and scope note, and the member grid or an empty
 *   state.
 */
export function MemberDirectory({
  members,
  congress,
  source,
  initialQuery = DEFAULT_MEMBER_DIRECTORY_QUERY,
}: MemberDirectoryProps): JSX.Element {
  const [filters, setFilters] = useState<MemberFilters>(initialQuery.filters);
  const [sort, setSort] = useState<MemberSort>(initialQuery.sort);

  // Both option lists are derived from the whole roster rather than from the filtered result, so choosing a party
  // doesn't empty the state list out from under the reader mid-narrowing.
  const jurisdictions: JurisdictionOption[] = useMemo(
    (): JurisdictionOption[] => listMemberJurisdictions(members),
    [members],
  );
  const parties: MemberFacetOption<PartyGroup>[] = useMemo(
    (): MemberFacetOption<PartyGroup>[] => listMemberPartyOptions(members),
    [members],
  );

  const shown: MemberDirectoryEntry[] = useMemo(
    (): MemberDirectoryEntry[] => sortMembers(filterMembers(members, filters), sort),
    [members, filters, sort],
  );

  const queryString: string = memberDirectoryQueryString({ filters, sort });

  /**
   * Mirrors the current view into the address bar.
   *
   * `history.replaceState` rather than `router.replace`, deliberately: a router navigation re-runs this route on the
   * server, and doing that on every keystroke would undo the entire point of a directory that filters in the browser.
   * This changes the URL and nothing else — no request, no re-render, no loading state. Next.js supports exactly this
   * for the case where the URL is a *record* of client state rather than an instruction to fetch something.
   *
   * `replace` rather than `push` for a related reason: typing seven letters into the search box should not leave seven
   * entries for the back button to walk out of.
   *
   * The hash is carried through so following the skip link and then typing doesn't silently drop the fragment.
   *
   * The path is read from `window.location` rather than reconstructed from a route constant, which is also what keeps
   * this correct under the static demo's `basePath` — `/civic-ledger/members` stays `/civic-ledger/members`.
   */
  useEffect((): void => {
    window.history.replaceState(null, "", `${window.location.pathname}${queryString}${window.location.hash}`);
  }, [queryString]);

  const isFiltered: boolean = hasActiveMemberFilters(filters);
  const countLabel: string = isFiltered
    ? `${shown.length} of ${members.length} ${pluralize(members.length, "Member")}`
    : `${members.length} ${pluralize(members.length, "Member")}`;

  const scopeNote: string =
    source === "live"
      ? `Everyone holding a seat in the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Vacant seats are simply absent.`
      : "Placeholder people, shown until a Congress.gov API key is configured. Some no longer hold a seat.";

  /** Applies one facet without disturbing the others. */
  function update(patch: Partial<MemberFilters>): void {
    setFilters((current: MemberFilters): MemberFilters => ({ ...current, ...patch }));
  }

  return (
    <section className="member-directory" aria-label="Member directory">
      <div className="directory-controls">
        <div className="directory-search">
          <Search aria-hidden="true" size={18} />
          <label className="sr-only" htmlFor="member-directory-search">
            Search members by name or the place they represent
          </label>
          <input
            id="member-directory-search"
            onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>): void =>
              update({ query: event.target.value })
            }
            placeholder="Search by name or place"
            type="search"
            value={filters.query}
          />
        </div>

        <fieldset className="stage-filters">
          <legend className="sr-only">Filter by chamber</legend>
          <SlidersHorizontal aria-hidden="true" size={15} />
          {CHAMBER_OPTIONS.map(
            (option: ChamberFilter): JSX.Element => (
              <button
                aria-pressed={filters.chamber === option}
                className={filters.chamber === option ? "is-active" : ""}
                key={option}
                onClick={(): void => update({ chamber: option })}
                type="button"
              >
                {option === ANY_FACET ? "Both Chambers" : chamberShortLabels[option as CongressChamber]}
              </button>
            ),
          )}
        </fieldset>
      </div>

      <div className="member-facets">
        <div className="member-facet">
          <label htmlFor="member-party-filter">Party</label>
          <select
            id="member-party-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
              update({ party: event.target.value as PartyFilter })
            }
            value={filters.party}
          >
            <option value={ANY_FACET}>All Parties ({members.length})</option>
            {parties.map(
              (party: MemberFacetOption<PartyGroup>): JSX.Element => (
                <option key={party.value} value={party.value}>
                  {party.label} ({party.count})
                </option>
              ),
            )}
          </select>
        </div>

        <div className="member-facet">
          <label htmlFor="member-state-filter">State or Territory</label>
          <select
            id="member-state-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void => update({ state: event.target.value })}
            value={filters.state}
          >
            <option value={ANY_FACET}>All States and Territories</option>
            <JurisdictionOptions options={jurisdictions} />
          </select>
        </div>

        <div className="member-facet member-facet--sort">
          {/* Reordering the grid in place is not the WCAG 3.2.2 "on input" pattern the Congress picker has to warn
              about — nothing navigates, and the reader stays exactly where they were. The order is named in the
              result-count line below, which is a live region, so the change is announced rather than only visible. */}
          <label htmlFor="member-sort">
            <ArrowDownUp aria-hidden="true" size={13} /> Sort By
          </label>
          <select
            id="member-sort"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void => setSort(event.target.value as MemberSort)}
            value={sort}
          >
            {memberSorts.map(
              (option: MemberSort): JSX.Element => (
                <option key={option} value={option}>
                  {memberSortLabels[option]}
                </option>
              ),
            )}
          </select>
        </div>

        {isFiltered ? (
          <button
            className="button button--quiet member-facets__clear"
            onClick={(): void => setFilters(NO_MEMBER_FILTERS)}
            type="button"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      <p className="directory-result-count" aria-live="polite">
        <span>{countLabel}</span>
        {/* Named only when it isn't the default, so the common case stays a plain count rather than restating
            "alphabetical" on every page load. */}
        {sort !== DEFAULT_MEMBER_SORT ? (
          <span className="directory-result-count__order"> · Sorted by {memberSortLabels[sort]}</span>
        ) : null}
      </p>
      <p className="directory-search-note">{scopeNote}</p>

      {shown.length > 0 ? (
        <div className="member-grid">
          {shown.map(
            (entry: MemberDirectoryEntry): JSX.Element => (
              <MemberCard entry={entry} key={entry.bioguideId} />
            ),
          )}
        </div>
      ) : (
        <div className="no-results">
          <h2>No Members Match Those Filters.</h2>
          <p>Try a shorter name, a different chamber, or clear the filters to start again.</p>
        </div>
      )}
    </section>
  );
}
