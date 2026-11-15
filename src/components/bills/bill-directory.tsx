"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { type JSX, useCallback, useState } from "react";

import { BillCard } from "@/components/bills/bill-card";
import {
  DirectoryEmptyState,
  DirectoryResultCount,
  DirectorySearch,
  SegmentedFilter,
} from "@/components/ui/directory-controls";
import { type BillSearchState, useBillSearch } from "@/hooks/use-bill-search";
import { useDirectoryUrlSync } from "@/hooks/use-directory-url-sync";
import { type BillPageResponse, billPageRequestUrl } from "@/lib/api-contract";
import {
  billIdentityKey,
  billStageLabels,
  billStages,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/bills/model";
import {
  type BillDirectoryQuery,
  type BillStageFilter,
  billDirectoryQueryString,
  parseBillDirectoryQuery,
} from "@/lib/congress/bills/search";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import { formatOrdinal, pluralize } from "@/lib/format";

/** The stage control's options: every stage, preceded by the "no filter" choice. */
const STAGE_FILTER_OPTIONS: readonly BillStageFilter[] = [ANY_FACET, ...billStages];

/** Props for {@link BillDirectory}. */
type BillDirectoryProps = {
  /** The first page of bills, resolved server-side by whichever directory route rendered this. */
  bills: LegislativeBill[];
  /** Seeds the search box from the shareable `?q=` deep link. */
  initialQuery: string;
  /** Seeds the stage filter from the shareable `?stage=` deep link. Defaults to no stage narrowing. */
  initialStage?: BillStageFilter;
  /** Only live Congress.gov data supports paging further; preview data is a fixed sample. */
  canLoadMore: boolean;
  /** Scopes "Load More" to a specific Congress. Omitted on `/bills`, where the API defaults to the current one. */
  congress?: number;
};

/**
 * Interactive bill directory. With no search text it browses `bills`, with "Load More" paging through `/api/bills`.
 * Once the user types, search moves to `/api/bills/search`, which sweeps every supported Congress server-side
 * (@see useBillSearch). The stage filter applies to whichever list is showing.
 *
 * @param props - @see BillDirectoryProps
 * @returns The search and filter controls, the result grid or an empty state, and the "Load More" control when more
 *   pages remain.
 */
export function BillDirectory({
  bills,
  initialQuery,
  initialStage = ANY_FACET,
  canLoadMore,
  congress,
}: BillDirectoryProps): JSX.Element {
  const [query, setQuery] = useState<string>(initialQuery);
  const [stage, setStage] = useState<BillStageFilter>(initialStage);
  const [allBills, setAllBills] = useState<LegislativeBill[]>(bills);
  const [hasMore, setHasMore] = useState<boolean>(canLoadMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  const search: BillSearchState = useBillSearch(query, allBills);
  const isSearchActive: boolean = query.trim().length > 0;

  const queryString: string = billDirectoryQueryString(query, stage);
  const requestedQueryString: string = billDirectoryQueryString(initialQuery, initialStage);

  /** Takes the view a URL names as the current one, via the route's own parser. */
  const adoptUrl: (location: string) => void = useCallback((location: string): void => {
    const view: BillDirectoryQuery = parseBillDirectoryQuery(new URLSearchParams(location));

    setQuery(view.query);
    setStage(view.stage);
  }, []);

  useDirectoryUrlSync({ adopt: adoptUrl, queryString, requestedQueryString });

  /**
   * Fetches the next page from `/api/bills` (offset = bills held) and appends it. A short or empty page ends paging; a
   * failure shows an error beside the button.
   */
  async function loadMore(): Promise<void> {
    setIsLoadingMore(true);
    setLoadError(false);

    try {
      const response: Response = await fetch(billPageRequestUrl(allBills.length, congress));
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const payload = (await response.json()) as BillPageResponse;

      if (payload.bills.length === 0) {
        setHasMore(false);
      } else {
        setAllBills((current: LegislativeBill[]): LegislativeBill[] => [...current, ...payload.bills]);
        if (payload.bills.length < DEFAULT_PAGE_SIZE) setHasMore(false);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const sourceBills: LegislativeBill[] = isSearchActive ? (search.results ?? []) : allBills;
  const displayedBills: LegislativeBill[] =
    stage === ANY_FACET ? sourceBills : sourceBills.filter((bill: LegislativeBill): boolean => bill.stage === stage);

  const isInitialSearchLoad: boolean = isSearchActive && search.isSearching && search.results === null;
  const resultCountLabel: string = isInitialSearchLoad
    ? "Searching Every Congress…"
    : isSearchActive
      ? `${displayedBills.length} ${pluralize(displayedBills.length, "Match", "Matches")}${search.isSearching ? " · Updating…" : ""}`
      : `Showing ${displayedBills.length} ${pluralize(displayedBills.length, "Record")}`;

  const congressRangeLabel: string = `${formatOrdinal(EARLIEST_COVERED_CONGRESS)}–${formatOrdinal(getCurrentCongress())} Congresses`;
  const searchScopeNote: string | null = search.degraded
    ? "Broader search isn't available right now — showing matches from what's already loaded."
    : search.meta
      ? `Matched against titles, policy areas, and latest actions — across the ${congressRangeLabel}, but only each Congress's most recently updated records rather than every bill it holds.${
          search.meta.truncated ? " Showing the most recent matches." : ""
        }`
      : null;

  const showNoRecordsYet: boolean = !isSearchActive && allBills.length === 0;
  const showNoMatches: boolean = !showNoRecordsYet && displayedBills.length === 0 && !isInitialSearchLoad;

  /** Clears search and stage together, since a reader who emptied the grid rarely knows which one did it. */
  function clearFilters(): void {
    setQuery("");
    setStage(ANY_FACET);
  }

  return (
    <section className="bill-directory" aria-label="Bill directory">
      <div className="directory-controls">
        <DirectorySearch
          id="bill-directory-search"
          label="Search bill records"
          onChange={setQuery}
          placeholder="Search by bill, topic, or action"
          value={query}
        />
        <SegmentedFilter
          labelFor={(item: BillStageFilter): string => (item === ANY_FACET ? "All Stages" : billStageLabels[item])}
          legend="Filter by legislative stage"
          onSelect={setStage}
          options={STAGE_FILTER_OPTIONS}
          selected={stage}
        />
      </div>

      <DirectoryResultCount count={resultCountLabel} />
      {isSearchActive && searchScopeNote ? <p className="directory-search-note">{searchScopeNote}</p> : null}

      {displayedBills.length > 0 ? (
        <div className="directory-grid">
          {displayedBills.map(
            (bill: LegislativeBill): JSX.Element => (
              <BillCard bill={bill} key={billIdentityKey(bill)} />
            ),
          )}
        </div>
      ) : showNoRecordsYet ? (
        // No clear action: this Congress holds no records at all, which no filter caused and none can undo.
        <DirectoryEmptyState
          body="Nothing has been recorded for this Congress yet. Try another Congress above, or check back soon."
          heading="No Records Yet."
        />
      ) : showNoMatches ? (
        <DirectoryEmptyState
          body="Try a shorter phrase, a bill number, or another stage."
          heading="No Records Match That Search."
          onClear={clearFilters}
        />
      ) : null}

      {hasMore && !isSearchActive ? (
        <div className="directory-load-more">
          <button className="button button--secondary" disabled={isLoadingMore} onClick={loadMore} type="button">
            {isLoadingMore ? (
              <>
                <Loader2 aria-hidden="true" className="spin" size={16} /> Loading More…
              </>
            ) : (
              <>
                Load More Bills <ChevronDown aria-hidden="true" size={16} />
              </>
            )}
          </button>
          {loadError ? (
            <p className="directory-load-more__error" role="alert">
              Could not load more records. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
