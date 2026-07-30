"use client";

import { ArrowDownUp, X } from "lucide-react";
import { type ChangeEvent, type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommitteeCard } from "@/components/committee-card";
import { DirectorySearch, SegmentedFilter } from "@/components/directory-controls";
import {
  ANY_COMMITTEE_FACET,
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
import type { CongressSnapshot } from "@/lib/congress/types";
import { formatOrdinal, pluralize } from "@/lib/format";

/** The chamber control's options: all three chambers, preceded by the "no filter" choice. */
const CHAMBER_OPTIONS: readonly CommitteeChamberFilter[] = [ANY_COMMITTEE_FACET, ...committeeChambers];

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
 * `MemberDirectory` down to the URL reconciliation, and deliberately so: the two are the same kind of page and a
 * reader should not have to learn each of them separately. @see MemberDirectory, whose comments explain the
 * `history.replaceState` and two-way reconciliation decisions this component inherits rather than restates.
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

  // Derived from the whole list rather than from the filtered result, so choosing a chamber doesn't empty the type
  // list out from under the reader mid-narrowing.
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

  /** The query string this component last wrote, or `undefined` before it has written one. */
  const lastWritten = useRef<string | undefined>(undefined);

  /**
   * Keeps the address bar and the visible view agreeing, in whichever direction is out of date.
   *
   * @see the same effect in `MemberDirectory` for why this reconciles in both directions, why it runs on every render
   *   rather than keyed to `queryString`, and why writes use `history.replaceState` rather than the router.
   */
  useEffect((): void => {
    const current: string = window.location.search;

    if (current === queryString) {
      lastWritten.current = queryString;
      return;
    }

    if (lastWritten.current === undefined) {
      lastWritten.current = current;

      // First reconciliation after mount: props normally win, except in a static export, which has no server to have
      // resolved the URL and so hands over the default view while the address bar still names a narrowed one.
      if (requestedQueryString.length === 0) adoptUrl(current);
      return;
    }

    if (current === lastWritten.current) {
      window.history.replaceState(null, "", `${window.location.pathname}${queryString}${window.location.hash}`);
      lastWritten.current = queryString;
      return;
    }

    lastWritten.current = current;
    adoptUrl(current);
  });

  /** Follows Back and Forward, which restore a URL without re-rendering anything. */
  useEffect((): (() => void) => {
    function onPopState(): void {
      lastWritten.current = window.location.search;
      adoptUrl(window.location.search);
    }

    window.addEventListener("popstate", onPopState);
    return (): void => window.removeEventListener("popstate", onPopState);
  }, [adoptUrl]);

  const isFiltered: boolean = hasActiveCommitteeFilters(filters);
  const countLabel: string = isFiltered
    ? `${shown.length} of ${committees.length} ${pluralize(committees.length, "Committee")}`
    : `${committees.length} ${pluralize(committees.length, "Committee")}`;

  const scopeNote: string =
    source === "live"
      ? `Every committee of the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Subcommittees are listed on their parent committee's page rather than here.`
      : "Placeholder committees, shown until a Congress.gov API key is configured. None of these is a real committee.";

  /** Applies one facet without disturbing the others. */
  function update(patch: Partial<CommitteeFilters>): void {
    setFilters((current: CommitteeFilters): CommitteeFilters => ({ ...current, ...patch }));
  }

  return (
    <section className="member-directory" aria-label="Committee directory">
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
            option === ANY_COMMITTEE_FACET ? "All Chambers" : committeeChamberShortLabels[option as CommitteeChamber]
          }
          legend="Filter by chamber"
          onSelect={(chamber: CommitteeChamberFilter): void => update({ chamber })}
          options={CHAMBER_OPTIONS}
          selected={filters.chamber}
        />
      </div>

      <div className="member-facets">
        <div className="member-facet">
          <label htmlFor="committee-type-filter">Committee Type</label>
          <select
            id="committee-type-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
              update({ type: event.target.value as CommitteeTypeFilter })
            }
            value={filters.type}
          >
            <option value={ANY_COMMITTEE_FACET}>All Types ({committees.length})</option>
            {types.map(
              (type: CommitteeFacetOption<CommitteeType>): JSX.Element => (
                <option key={type.value} value={type.value}>
                  {type.label} ({type.count})
                </option>
              ),
            )}
          </select>
        </div>

        <div className="member-facet member-facet--sort">
          {/* Reordering the grid in place is not the WCAG 3.2.2 "on input" pattern — nothing navigates, and the order
              is named in the result-count line below, which is a live region. @see MemberDirectory. */}
          <label htmlFor="committee-sort">
            <ArrowDownUp aria-hidden="true" size={13} /> Sort By
          </label>
          <select
            id="committee-sort"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void => setSort(event.target.value as CommitteeSort)}
            value={sort}
          >
            {committeeSorts.map(
              (option: CommitteeSort): JSX.Element => (
                <option key={option} value={option}>
                  {committeeSortLabels[option]}
                </option>
              ),
            )}
          </select>
        </div>

        {isFiltered ? (
          <button className="member-facets__clear" onClick={(): void => setFilters(NO_COMMITTEE_FILTERS)} type="button">
            <X aria-hidden="true" size={14} /> Clear Filters
          </button>
        ) : null}
      </div>

      <p className="directory-result-count" aria-live="polite">
        <span>{countLabel}</span>
        {sort !== DEFAULT_COMMITTEE_SORT ? (
          <span className="directory-result-count__order"> · Sorted by {committeeSortLabels[sort]}</span>
        ) : null}
      </p>
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
