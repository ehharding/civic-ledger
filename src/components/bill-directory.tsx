"use client";

import { Loader2 } from "lucide-react";
import { type JSX, useEffect, useState } from "react";

import { BillCard } from "@/components/bill-card";
import { DirectorySearch, SegmentedFilter } from "@/components/directory-controls";
import { type BillSearchState, useBillSearch } from "@/hooks/use-bill-search";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { type BillStageFilter, billDirectoryQueryString } from "@/lib/congress/search";
import {
  billIdentityKey,
  billStageLabels,
  billStages,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatOrdinal, pluralize } from "@/lib/format";

/** The stage control's options: every stage, preceded by the "no filter" choice. */
const STAGE_FILTER_OPTIONS: readonly BillStageFilter[] = ["all", ...billStages];

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
export function BillDirectory({
  bills,
  initialQuery,
  initialStage = "all",
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

  /**
   * Mirrors the current search and stage into the address bar, so a directory view can be linked and bookmarked.
   *
   * This route could already *receive* a `?q=` link — the site header's search form sends one — but nothing ever
   * produced one from the page itself, so a reader who found something here had no way to hand it to anyone else. The
   * two halves now use the same spelling of that URL. @see billDirectoryQueryString
   *
   * `history.replaceState` rather than a router navigation, for the same reason `MemberDirectory` uses it: the URL is
   * recording client state, not requesting a new render, and re-running the route on every keystroke would fight the
   * debounced search this component already does carefully. `replace` rather than `push` keeps typing out of the back
   * button's history.
   *
   * Reading the path off `window.location` rather than rebuilding it also means this stays correct on `/bills` and
   * `/bills/[congress]` alike, and under the static demo's `basePath`, without either being special-cased.
   */
  useEffect((): void => {
    window.history.replaceState(null, "", `${window.location.pathname}${queryString}${window.location.hash}`);
  }, [queryString]);

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
      ? `${displayedBills.length} ${pluralize(displayedBills.length, "Match", "Matches")}${search.isSearching ? " · Updating…" : ""}`
      : `Showing ${displayedBills.length} ${pluralize(displayedBills.length, "Record")}`;

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
        <DirectorySearch
          id="bill-directory-search"
          label="Search bill records"
          onChange={setQuery}
          placeholder="Search by bill, topic, or action"
          value={query}
        />
        <SegmentedFilter
          labelFor={(item: BillStageFilter): string => (item === "all" ? "All Stages" : billStageLabels[item])}
          legend="Filter by legislative stage"
          onSelect={setStage}
          options={STAGE_FILTER_OPTIONS}
          selected={stage}
        />
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
