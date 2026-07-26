"use client";

import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, type JSX, type RefObject, useEffect, useRef, useState } from "react";

import { BillCard } from "@/components/bill-card";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { matchesQuery } from "@/lib/congress/search";
import {
  type BillStage,
  billIdentityKey,
  billStageLabels,
  billStages,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

type StageFilter = "all" | BillStage;

/** How long to wait after the user stops typing before firing a search request, so each keystroke doesn't. */
const SEARCH_DEBOUNCE_MS: number = 300;

/** Shape of `/api/bills/search`'s JSON response — kept in sync with `BillSearchResult` in client.ts. Defined locally
 * rather than imported from there, the same way `loadMore` below types `/api/bills`'s response: client.ts is a
 * server-only module (it reads `process.env.CONGRESS_API_KEY` and calls Congress.gov directly), so this component
 * only depends on the isomorphic `@/lib/congress/types` and `@/lib/congress/search` modules, never on it. */
type SearchResponse = {
  bills: LegislativeBill[];
  congressesSearched: number;
  truncated: boolean;
};

/**
 * Interactive bill directory. With no search text, this simply browses `bills` (the page passed in from the server),
 * with "Load More" pagination fetching additional pages from `/api/bills` when `canLoadMore` is true.
 *
 * Once the user types a query (debounced), search shifts entirely to `/api/bills/search`, which sweeps every Congress
 * this app supports rather than only what's already loaded on this page — Congress.gov's own API has no full-text
 * search, so that sweep-and-filter happens server-side (see `getSearchResults` in client.ts) instead of this component
 * filtering its own small, already-loaded slice. If that route can't be reached — for example, the static GitHub Pages
 * demo, which has no server left at request time — this falls back to filtering whatever's already loaded, client-side,
 * using the same match rules (`matchesQuery`), so search still does something useful rather than going dead.
 */
export function BillDirectory({
  bills,
  initialQuery,
  canLoadMore,
  congress,
}: {
  bills: LegislativeBill[];
  initialQuery: string;
  /** Only live Congress.gov data supports paging further; preview data is a fixed sample. */
  canLoadMore: boolean;
  /** Scopes "Load More" to a specific Congress. Omitted on the default (current-Congress) /bills route, where
   * /api/bills already defaults to the current Congress on its own. */
  congress?: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [stage, setStage] = useState<StageFilter>("all");
  const [allBills, setAllBills] = useState<LegislativeBill[]>(bills);
  const [hasMore, setHasMore] = useState<boolean>(canLoadMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  const [searchResults, setSearchResults] = useState<LegislativeBill[] | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchMeta, setSearchMeta] = useState<{ congressesSearched: number; truncated: boolean } | null>(null);
  const [searchDegraded, setSearchDegraded] = useState<boolean>(false);
  /** Guards against an earlier, slower request overwriting a later one's results once both resolve. */
  const searchRequestId: RefObject<number> = useRef(0);

  const trimmedQuery: string = query.trim();
  const isSearchActive: boolean = trimmedQuery.length > 0;

  // Debounced search: fires `SEARCH_DEBOUNCE_MS` after the user stops typing, and is canceled/superseded by any query
  // change before then. Clearing the query reverts to the plain browse listing with no request at all.
  useEffect((): (() => void) | undefined => {
    if (!trimmedQuery) {
      searchRequestId.current += 1;
      setSearchResults(null);
      setSearchMeta(null);
      setSearchDegraded(false);
      setIsSearching(false);
      return;
    }

    const requestId: number = ++searchRequestId.current;
    setIsSearching(true);

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout((): void => {
      fetch(`/api/bills/search?q=${encodeURIComponent(trimmedQuery)}`)
        .then((response: Response): Promise<SearchResponse> => {
          if (!response.ok) throw new Error(`Request failed with ${response.status}`);
          return response.json() as Promise<SearchResponse>;
        })
        .then((payload: SearchResponse): void => {
          if (requestId !== searchRequestId.current) return;
          setSearchResults(payload.bills);
          setSearchMeta({ congressesSearched: payload.congressesSearched, truncated: payload.truncated });
          setSearchDegraded(false);
        })
        .catch((): void => {
          if (requestId !== searchRequestId.current) return;
          setSearchResults(allBills.filter((bill: LegislativeBill): boolean => matchesQuery(bill, trimmedQuery)));
          setSearchMeta(null);
          setSearchDegraded(true);
        })
        .finally((): void => {
          if (requestId === searchRequestId.current) setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return (): void => clearTimeout(timeoutId);
  }, [trimmedQuery, allBills]);

  /**
   * Fetches the next page from `/api/bills` (offset = current bill count) and appends it to `allBills`.
   * Stops offering further pages once a short/empty page comes back or the request fails outright.
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

  const sourceBills: LegislativeBill[] = isSearchActive ? (searchResults ?? []) : allBills;
  const displayedBills: LegislativeBill[] =
    stage === "all" ? sourceBills : sourceBills.filter((bill: LegislativeBill): boolean => bill.stage === stage);

  const isInitialSearchLoad: boolean = isSearchActive && isSearching && searchResults === null;
  const resultCountLabel: string = isInitialSearchLoad
    ? "Searching Every Congress…"
    : isSearchActive
      ? `${displayedBills.length} ${displayedBills.length === 1 ? "Match" : "Matches"}${isSearching ? " · Updating…" : ""}`
      : `Showing ${displayedBills.length} ${displayedBills.length === 1 ? "Record" : "Records"}`;

  const congressRangeLabel: string = `${formatOrdinal(EARLIEST_COVERED_CONGRESS)}–${formatOrdinal(getCurrentCongress())} Congresses`;
  const searchScopeNote: string | null = searchDegraded
    ? "Broader search isn't available right now — showing matches from what's already loaded."
    : searchMeta
      ? `Matched against titles, policy areas, and latest actions across the ${congressRangeLabel}.${
          searchMeta.truncated ? " Showing the most recent matches." : ""
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
