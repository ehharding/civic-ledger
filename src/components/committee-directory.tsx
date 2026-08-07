"use client";

import { type JSX, useCallback, useMemo, useState } from "react";

import { CommitteeCard } from "@/components/committee-card";
import {
  ClearFiltersButton,
  DirectoryFacet,
  DirectoryResultCount,
  DirectorySearch,
  DirectorySort,
  directoryCountLabel,
  FacetOptions,
  SegmentedFilter,
} from "@/components/directory-controls";
import { useDirectoryUrlSync } from "@/hooks/use-directory-url-sync";
import {
  type CommitteeChamberFilter,
  type CommitteeDirectoryQuery,
  type CommitteeFacetOption,
  type CommitteeFilters,
  type CommitteeSort,
  type CommitteeTypeFilter,
  committeeDirectoryQueryString,
  committeeSortLabels,
  committeeSorts,
  DEFAULT_COMMITTEE_DIRECTORY_QUERY,
  DEFAULT_COMMITTEE_SORT,
  filterCommittees,
  hasActiveCommitteeFilters,
  listCommitteeTypeOptions,
  NO_COMMITTEE_FILTERS,
  parseCommitteeDirectoryQuery,
  sortCommittees,
} from "@/lib/congress/committee-filter";
import {
  type CommitteeChamber,
  type CommitteeSummary,
  type CommitteeType,
  committeeChamberShortLabels,
  committeeChambers,
} from "@/lib/congress/committees";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import type { CongressSnapshot } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** The chamber control's options: all three chambers, preceded by the "no filter" choice. */
const CHAMBER_OPTIONS: readonly CommitteeChamberFilter[] = [ANY_FACET, ...committeeChambers];

/** Props for {@link CommitteeDirectory}. */
type CommitteeDirectoryProps = {
  /** Every parent committee, already ordered server-side. */
  committees: CommitteeSummary[];
  /** The Congress these committees belong to, named in the scope note. */
  congress: number;
  /** Whether these are live Congress.gov records or labeled placeholders. Changes the scope note's claim. */
  source: CongressSnapshot["source"];
  /**
   * The view the URL asked for, resolved server-side so a shared link renders narrowed on its very first paint rather
   * than flashing the whole list and then filtering it. Defaults to the unfiltered directory.
   * @see resolveCommitteeDirectoryQuery
   */
  initialQuery?: CommitteeDirectoryQuery;
};

/**
 * Browsable directory of every committee of a Congress.
 *
 * Every narrowing happens in the browser against the list the server already sent — no request per keystroke, no
 * debounce, no loading state, and nothing to go wrong offline or in the static export. This is the same shape as
 * `MemberDirectory` down to the URL reconciliation, and deliberately so: the two are the same kind of page and a reader
 * should not have to learn each of them separately — which is why the reconciliation itself is one shared hook rather
 * than two copies that can drift.
 * @see useDirectoryUrlSync.
 *
 * @param props - @see CommitteeDirectoryProps
 * @returns The search, facet, and sort controls, the result count and scope note, and the committee grid or an empty
 *   state.
 */
export function CommitteeDirectory({
  committees,
  congress,
  source,
  initialQuery = DEFAULT_COMMITTEE_DIRECTORY_QUERY,
}: CommitteeDirectoryProps): JSX.Element {
  const [filters, setFilters] = useState<CommitteeFilters>(initialQuery.filters);
  const [sort, setSort] = useState<CommitteeSort>(initialQuery.sort);

  // Derived from the whole list rather than from the filtered result, so choosing a chamber doesn't empty the type list
  // out from under the reader mid-narrowing.
  const types: CommitteeFacetOption<CommitteeType>[] = useMemo(
    (): CommitteeFacetOption<CommitteeType>[] => listCommitteeTypeOptions(committees),
    [committees],
  );

  const shown: CommitteeSummary[] = useMemo(
    (): CommitteeSummary[] => sortCommittees(filterCommittees(committees, filters), sort),
    [committees, filters, sort],
  );

  const queryString: string = committeeDirectoryQueryString({ filters, sort });
  const requestedQueryString: string = committeeDirectoryQueryString(initialQuery);

  /** Takes the view a URL names as the current one, through the same parser the route uses. */
  const adoptUrl = useCallback((search: string): void => {
    const view: CommitteeDirectoryQuery = parseCommitteeDirectoryQuery(new URLSearchParams(search));

    setFilters(view.filters);
    setSort(view.sort);
  }, []);

  useDirectoryUrlSync({ adopt: adoptUrl, queryString, requestedQueryString });

  const isFiltered: boolean = hasActiveCommitteeFilters(filters);
  const countLabel: string = directoryCountLabel(shown.length, committees.length, "Committee", isFiltered);

  const scopeNote: string =
    source === "live"
      ? `Every committee of the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Subcommittees are listed on their parent committee's page rather than here.`
      : "Placeholder committees, shown until a Congress.gov API key is configured. None of these is a real committee.";

  /** Applies one facet without disturbing the others. */
  function update(patch: Partial<CommitteeFilters>): void {
    setFilters((current: CommitteeFilters): CommitteeFilters => ({ ...current, ...patch }));
  }

  return (
    <section className="committee-directory" aria-label="Committee directory">
      <div className="directory-controls">
        <DirectorySearch
          id="committee-directory-search"
          label="Search committees by name"
          onChange={(query: string): void => update({ query })}
          placeholder="Search by committee name"
          value={filters.query}
        />

        <SegmentedFilter
          labelFor={(option: CommitteeChamberFilter): string =>
            option === ANY_FACET ? "All Chambers" : committeeChamberShortLabels[option as CommitteeChamber]
          }
          legend="Filter by chamber"
          onSelect={(chamber: CommitteeChamberFilter): void => update({ chamber })}
          options={CHAMBER_OPTIONS}
          selected={filters.chamber}
        />
      </div>

      <div className="directory-facets">
        <DirectoryFacet
          anyLabel={`All Types (${committees.length})`}
          id="committee-type-filter"
          label="Committee Type"
          onChange={(type: CommitteeTypeFilter): void => update({ type })}
          value={filters.type}
        >
          <FacetOptions options={types} />
        </DirectoryFacet>

        <DirectorySort
          id="committee-sort"
          labels={committeeSortLabels}
          onChange={setSort}
          options={committeeSorts}
          value={sort}
        />

        {isFiltered ? <ClearFiltersButton onClear={(): void => setFilters(NO_COMMITTEE_FILTERS)} /> : null}
      </div>

      <DirectoryResultCount
        count={countLabel}
        order={sort === DEFAULT_COMMITTEE_SORT ? undefined : committeeSortLabels[sort]}
      />
      <p className="directory-search-note">{scopeNote}</p>

      {shown.length > 0 ? (
        <div className="committee-grid">
          {shown.map(
            (committee: CommitteeSummary): JSX.Element => (
              <CommitteeCard committee={committee} key={`${committee.chamber}-${committee.systemCode}`} />
            ),
          )}
        </div>
      ) : (
        <div className="no-results">
          <h2>No Committees Match Those Filters.</h2>
          <p>Try a shorter name, a different chamber, or clear the filters to start again.</p>
        </div>
      )}
    </section>
  );
}
