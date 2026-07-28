"use client";

import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, type JSX, useState } from "react";

import { BillCard } from "@/components/bill-card";
import { type BillSearchState, useBillSearch } from "@/hooks/use-bill-search";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import {
  type BillStage,
  billIdentityKey,
  billStageLabels,
  billStages,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** The stage filter's selection: one of the five legislative stages, or no filter at all. */
type StageFilter = "all" | BillStage;

/** Props for {@link BillDirectory}. */
type BillDirectoryProps = {
  /** The first page of bills, resolved server-side by whichever directory route rendered this. */
  bills: LegislativeBill[];
  /** Seeds the search box from the shareable `?q=` deep link. */
  initialQuery: string;
  /** Only live Congress.gov data supports paging further; preview data is a fixed sample. */
  canLoadMore: boolean;
  /**
   * Scopes "Load More" to a specific Congress. Omitted on the default `/bills` route, where `/api/bills` already
   * defaults to the current Congress on its own.
   */
  congress?: number;
};

/**
 * Interactive bill directory.
 *
 * With no search text this browses `bills` — the page the server passed in — with "Load More" fetching further pages
 * from `/api/bills` when `canLoadMore` is true.
 *
 * Once the user types, search shifts entirely to `/api/bills/search`, which sweeps every Congress this app supports
 * rather than only what's already on screen. Congress.gov has no full-text search endpoint, so that sweep has to happen
 * server-side; filtering the dozen already-loaded bills would look like search while silently answering a much smaller
 * question. @see useBillSearch for the debouncing, cancellation, and offline-fallback behavior behind that.
 *
 * The stage filter applies to whichever list is showing, browse or search, so narrowing by stage never silently changes
 * which set of bills is being narrowed.
 *
 * @param props - @see BillDirectoryProps
 * @returns The search and filter controls, the result grid or an empty state, and the "Load More" control when more
 *   pages remain.
 */
export function BillDirectory({ bills, initialQuery, canLoadMore, congress }: BillDirectoryProps): JSX.Element {
  const [query, setQuery] = useState<string>(initialQuery);
  const [stage, setStage] = useState<StageFilter>("all");
  const [allBills, setAllBills] = useState<LegislativeBill[]>(bills);
  const [hasMore, setHasMore] = useState<boolean>(canLoadMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  const search: BillSearchState = useBillSearch(query, allBills);
  const isSearchActive: boolean = query.trim().length > 0;

  /**
   * Fetches the next page from `/api/bills` and appends it.
   *
   * The offset is the number of bills already held, so paging stays correct however many pages have been loaded.
   * Further pages stop being offered once a short or empty page comes back — there is nothing left — and a failed
   * request surfaces an error beside the button rather than leaving it looking idle.
   */
  async function loadMore(): Promise<void> {
    setIsLoadingMore(true);
    setLoadError(false);

    try {
      const congressParam: string = congress ? `&congress=${congress}` : "";
      const response: Response = await fetch(`/api/bills?offset=${allBills.length}${congressParam}`);
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const payload = (await response.json()) as { bills: LegislativeBill[] };

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
    stage === "all" ? sourceBills : sourceBills.filter((bill: LegislativeBill): boolean => bill.stage === stage);

  const isInitialSearchLoad: boolean = isSearchActive && search.isSearching && search.results === null;
  const resultCountLabel: string = isInitialSearchLoad
    ? "Searching Every Congress…"
    : isSearchActive
      ? `${displayedBills.length} ${displayedBills.length === 1 ? "Match" : "Matches"}${search.isSearching ? " · Updating…" : ""}`
      : `Showing ${displayedBills.length} ${displayedBills.length === 1 ? "Record" : "Records"}`;

  const congressRangeLabel: string = `${formatOrdinal(EARLIEST_COVERED_CONGRESS)}–${formatOrdinal(getCurrentCongress())} Congresses`;
  const searchScopeNote: string | null = search.degraded
    ? "Broader search isn't available right now — showing matches from what's already loaded."
    : search.meta
      ? `Matched against titles, policy areas, and latest actions across the ${congressRangeLabel}.${
          search.meta.truncated ? " Showing the most recent matches." : ""
        }`
      : null;

  const showNoRecordsYet: boolean = !isSearchActive && allBills.length === 0;
  const showNoMatches: boolean = !showNoRecordsYet && displayedBills.length === 0 && !isInitialSearchLoad;

  return (
    <section className="bill-directory" aria-label="Bill directory">
      <div className="directory-controls">
        <div className="directory-search">
          <Search aria-hidden="true" size={18} />
          <label className="sr-only" htmlFor="bill-directory-search">
            Search bill records
          </label>
          <input
            id="bill-directory-search"
            onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>): void => setQuery(event.target.value)}
            placeholder="Search by bill, topic, or action"
            type="search"
            value={query}
          />
        </div>
        <fieldset className="stage-filters">
          <legend className="sr-only">Filter by legislative stage</legend>
          <SlidersHorizontal aria-hidden="true" size={15} />
          {(["all", ...billStages] as StageFilter[]).map(
            (item: StageFilter): JSX.Element => (
              <button
                aria-pressed={stage === item}
                className={stage === item ? "is-active" : ""}
                key={item}
                onClick={(): void => setStage(item)}
                type="button"
              >
                {item === "all" ? "All Stages" : billStageLabels[item]}
              </button>
            ),
          )}
        </fieldset>
      </div>

      <p className="directory-result-count" aria-live="polite">
        {resultCountLabel}
      </p>
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
        <div className="no-results">
          <h2>No Records Yet.</h2>
          <p>Nothing has been recorded for this Congress yet. Try another Congress above, or check back soon.</p>
        </div>
      ) : showNoMatches ? (
        <div className="no-results">
          <h2>No Records Match That Search.</h2>
          <p>Try a shorter phrase, a bill number, or another stage.</p>
        </div>
      ) : null}

      {hasMore && !isSearchActive ? (
        <div className="directory-load-more">
          <button className="button button--quiet" disabled={isLoadingMore} onClick={loadMore} type="button">
            {isLoadingMore ? (
              <>
                <Loader2 aria-hidden="true" className="spin" size={16} /> Loading More…
              </>
            ) : (
              "Load More Bills"
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
