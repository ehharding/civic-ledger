"use client";

import { type JSX, useCallback, useMemo } from "react";

import { MemberCard } from "@/components/members/member-card";
import {
  ClearFiltersButton,
  DirectoryEmptyState,
  DirectoryFacet,
  DirectoryResultCount,
  DirectorySearch,
  DirectorySort,
  directoryCountLabel,
  FACETED_DIRECTORY_EMPTY_ADVICE,
  FacetOptions,
  SegmentedFilter,
} from "@/components/ui/directory-controls";
import { useFacetedDirectory } from "@/hooks/use-faceted-directory";
import type { CongressSnapshot } from "@/lib/congress/bills/model";
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
} from "@/lib/congress/members/filter";
import {
  type CongressChamber,
  chamberShortLabels,
  congressChambers,
  type MemberDirectoryEntry,
  type PartyGroup,
} from "@/lib/congress/members/model";
import { formatOrdinal } from "@/lib/format";

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
 * The view itself — the filter and sort state, the address-bar mirroring, and the three ways the controls change
 * it — is held by {@link useFacetedDirectory}, shared with the committee directory because everything about it is the
 * same in both and none of it is about members. What is left here is what this directory is: its three facets, its
 * scope note, and its grid.
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

  const jurisdictionValues: string[] = useMemo(
    (): string[] => jurisdictions.map((option: JurisdictionOption): string => option.value),
    [jurisdictions],
  );

  /**
   * Reads a view out of a URL, through the same parser the route uses, so the browser and the server cannot disagree
   * about what a link means. Closes over the roster's jurisdictions, so `?state=` can only ever resolve to one the
   * control will actually offer.
   * @see parseMemberDirectoryQuery
   */
  const parseUrl = useCallback(
    (search: string): MemberDirectoryQuery =>
      parseMemberDirectoryQuery(new URLSearchParams(search), jurisdictionValues),
    [jurisdictionValues],
  );

  const { filters, sort, setSort, update, clear, isFiltered } = useFacetedDirectory<MemberFilters, MemberSort>({
    hasActiveFilters: hasActiveMemberFilters,
    initialQuery,
    noFilters: NO_MEMBER_FILTERS,
    parse: parseUrl,
    serialize: memberDirectoryQueryString,
  });

  const shown: MemberDirectoryEntry[] = useMemo(
    (): MemberDirectoryEntry[] => sortMembers(filterMembers(members, filters), sort),
    [members, filters, sort],
  );

  const countLabel: string = directoryCountLabel(shown.length, members.length, "Member", isFiltered);

  const scopeNote: string =
    source === "live"
      ? `Everyone holding a seat in the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Vacant seats are simply absent.`
      : "Placeholder people, shown until a Congress.gov API key is configured. Some no longer hold a seat.";

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

        {isFiltered ? <ClearFiltersButton onClear={clear} /> : null}
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
        <DirectoryEmptyState
          body={FACETED_DIRECTORY_EMPTY_ADVICE}
          heading="No Members Match Those Filters."
          onClear={isFiltered ? clear : undefined}
        />
      )}
    </section>
  );
}
