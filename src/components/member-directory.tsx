"use client";

import { type JSX, useCallback, useMemo, useState } from "react";

import {
  ClearFiltersButton,
  DirectoryFacet,
  DirectoryResultCount,
  DirectorySearch,
  DirectorySort,
  FacetOptions,
  SegmentedFilter,
} from "@/components/directory-controls";
import { MemberCard } from "@/components/member-card";
import { useDirectoryUrlSync } from "@/hooks/use-directory-url-sync";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import {
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
  parseMemberDirectoryQuery,
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
 * The grouping is the only thing this adds over the plain {@link FacetOptions} the app's other two facets use, and it
 * delegates the options themselves back to it — so a jurisdiction option is worded and counted identically to a party
 * or a committee type rather than by a second copy of the same three lines.
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
            <FacetOptions options={inGroup} />
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
 * bookmarked, or reopened — and a URL that changes underneath the page is followed rather than overwritten.
 * @see useDirectoryUrlSync, which all three of this app's directories share, for how that reconciliation works and why
 * it writes with `history.replaceState` rather than a router navigation.
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
  const requestedQueryString: string = memberDirectoryQueryString(initialQuery);
  const jurisdictionValues: string[] = useMemo(
    (): string[] => jurisdictions.map((option: JurisdictionOption): string => option.value),
    [jurisdictions],
  );

  /**
   * Takes the view a URL names as the current one.
   *
   * Read through the same parser the route uses, so the browser and the server cannot disagree about what a link means.
   * @see parseMemberDirectoryQuery
   */
  const adoptUrl = useCallback(
    (search: string): void => {
      const view: MemberDirectoryQuery = parseMemberDirectoryQuery(new URLSearchParams(search), jurisdictionValues);

      setFilters(view.filters);
      setSort(view.sort);
    },
    [jurisdictionValues],
  );

  useDirectoryUrlSync({ adopt: adoptUrl, queryString, requestedQueryString });

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
        <DirectorySearch
          id="member-directory-search"
          label="Search members by name or the place they represent"
          onChange={(query: string): void => update({ query })}
          placeholder="Search by name or place"
          value={filters.query}
        />

        <SegmentedFilter
          labelFor={(option: ChamberFilter): string =>
            option === ANY_FACET ? "Both Chambers" : chamberShortLabels[option as CongressChamber]
          }
          legend="Filter by chamber"
          onSelect={(chamber: ChamberFilter): void => update({ chamber })}
          options={CHAMBER_OPTIONS}
          selected={filters.chamber}
        />
      </div>

      <div className="directory-facets">
        <DirectoryFacet
          anyLabel={`All Parties (${members.length})`}
          id="member-party-filter"
          label="Party"
          onChange={(party: PartyFilter): void => update({ party })}
          value={filters.party}
        >
          <FacetOptions options={parties} />
        </DirectoryFacet>

        {/* The only facet in the app whose options are grouped, so it hands over `<optgroup>`s rather than the plain
            `FacetOptions` list its two peers use. @see JurisdictionOptions. */}
        <DirectoryFacet
          anyLabel="All States and Territories"
          id="member-state-filter"
          label="State or Territory"
          onChange={(state: string): void => update({ state })}
          value={filters.state}
        >
          <JurisdictionOptions options={jurisdictions} />
        </DirectoryFacet>

        <DirectorySort
          id="member-sort"
          labels={memberSortLabels}
          onChange={setSort}
          options={memberSorts}
          value={sort}
        />

        {isFiltered ? <ClearFiltersButton onClear={(): void => setFilters(NO_MEMBER_FILTERS)} /> : null}
      </div>

      {/* The order is named only when it isn't the default, so the common case stays a plain count rather than
          restating "alphabetical" on every page load. */}
      <DirectoryResultCount
        count={countLabel}
        order={sort === DEFAULT_MEMBER_SORT ? undefined : memberSortLabels[sort]}
      />
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
