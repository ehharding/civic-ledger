"use client";

import { type JSX, useMemo } from "react";

import { CommitteeCard } from "@/components/committees/committee-card";
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
} from "@/lib/congress/committees/filter";
import {
  type CommitteeChamber,
  type CommitteeSummary,
  type CommitteeType,
  committeeChamberShortLabels,
  committeeChambers,
} from "@/lib/congress/committees/model";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import { formatOrdinal } from "@/lib/format";

/** The chamber control's options: all three chambers, preceded by the "no filter" choice. */
const CHAMBER_OPTIONS: readonly CommitteeChamberFilter[] = [ANY_FACET, ...committeeChambers];

/**
 * Reads a view out of a URL, through the same parser the route uses, so the browser and the server cannot disagree
 * about what a link means.
 *
 * At module scope rather than inside the component, which is all this directory needs to satisfy
 * {@link useFacetedDirectory}'s stability requirement — nothing here closes over a prop.
 *
 * @param search - The address bar's query string.
 * @returns The view the URL asks for.
 */
function parseCommitteeDirectoryUrl(search: string): CommitteeDirectoryQuery {
  return parseCommitteeDirectoryQuery(new URLSearchParams(search));
}

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
 * should not have to learn each of them separately — which is why the whole of that shape is one shared hook rather
 * than two copies that can drift.
 * @see useFacetedDirectory.
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
  // Derived from the whole list rather than from the filtered result, so choosing a chamber doesn't empty the type list
  // out from under the reader mid-narrowing.
  const types: CommitteeFacetOption<CommitteeType>[] = useMemo(
    (): CommitteeFacetOption<CommitteeType>[] => listCommitteeTypeOptions(committees),
    [committees],
  );

  const { filters, sort, setSort, update, clear, isFiltered } = useFacetedDirectory<CommitteeFilters, CommitteeSort>({
    hasActiveFilters: hasActiveCommitteeFilters,
    initialQuery,
    noFilters: NO_COMMITTEE_FILTERS,
    // Stable without a `useCallback`, unlike the member directory's, which has to close over the roster's
    // jurisdictions: neither of this directory's facets is derived from the data, so a stale `?type=` is validated
    // against the model itself and this parser closes over nothing.
    parse: parseCommitteeDirectoryUrl,
    serialize: committeeDirectoryQueryString,
  });

  const shown: CommitteeSummary[] = useMemo(
    (): CommitteeSummary[] => sortCommittees(filterCommittees(committees, filters), sort),
    [committees, filters, sort],
  );

  const countLabel: string = directoryCountLabel(shown.length, committees.length, "Committee", isFiltered);

  const scopeNote: string =
    source === "live"
      ? `Every committee of the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Subcommittees are listed on their parent committee's page rather than here.`
      : "Placeholder committees, shown until a Congress.gov API key is configured. None of these is a real committee.";

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

        {isFiltered ? <ClearFiltersButton onClear={clear} /> : null}
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
        <DirectoryEmptyState
          body={FACETED_DIRECTORY_EMPTY_ADVICE}
          heading="No Committees Match Those Filters."
          onClear={isFiltered ? clear : undefined}
        />
      )}
    </section>
  );
}
