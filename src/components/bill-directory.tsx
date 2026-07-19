"use client";

import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, type JSX, useMemo, useState } from "react";

import { BillCard } from "@/components/bill-card";
import { type BillStage, billStageLabels, billStages, type LegislativeBill } from "@/lib/congress/types";

type StageFilter = "all" | BillStage;

/**
 * Interactive bill directory: client-side search/stage filtering over the bills passed in from the server,
 * plus "Load more" pagination that fetches additional pages from `/api/bills` (only offered when `canLoadMore`
 * is true, i.e. live data is active — the preview fixture set is small and fixed).
 */
export function BillDirectory({
  bills,
  initialQuery,
  canLoadMore,
}: {
  bills: LegislativeBill[];
  initialQuery: string;
  /** Only live Congress.gov data supports paging further; preview data is a fixed sample. */
  canLoadMore: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [stage, setStage] = useState<StageFilter>("all");
  const [allBills, setAllBills] = useState<LegislativeBill[]>(bills);
  const [hasMore, setHasMore] = useState<boolean>(canLoadMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  /** Bills matching the current search text and stage filter, recomputed only when inputs actually change. */
  const matchingBills: LegislativeBill[] = useMemo((): LegislativeBill[] => {
    const normalizedQuery: string = query.trim().toLowerCase();
    return allBills.filter((bill: LegislativeBill): boolean => {
      const matchesQuery: boolean =
        !normalizedQuery ||
        [bill.title, bill.type, bill.number, bill.policyArea, bill.latestAction.text]
          .filter(Boolean)
          .some((value: string | undefined): boolean | undefined => value?.toLowerCase().includes(normalizedQuery));
      return matchesQuery && (stage === "all" || bill.stage === stage);
    });
  }, [allBills, query, stage]);

  /**
   * Fetches the next page from `/api/bills` (offset = current bill count) and appends it to `allBills`.
   * Stops offering further pages once a short/empty page comes back or the request fails outright.
   */
  async function loadMore(): Promise<void> {
    setIsLoadingMore(true);
    setLoadError(false);

    try {
      const response: Response = await fetch(`/api/bills?offset=${allBills.length}`);
      if (!response.ok) throw new Error(`Request Failed With ${response.status}`);

      const payload = (await response.json()) as { bills: LegislativeBill[] };

      if (payload.bills.length === 0) {
        setHasMore(false);
      } else {
        setAllBills((current: LegislativeBill[]): LegislativeBill[] => [...current, ...payload.bills]);
        if (payload.bills.length < 12) setHasMore(false);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <section className="bill-directory" aria-label="Bill Directory">
      <div className="directory-controls">
        <div className="directory-search">
          <Search aria-hidden="true" size={18} />
          <label className="sr-only" htmlFor="bill-directory-search">
            Search Bill Records
          </label>
          <input
            id="bill-directory-search"
            onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>): void => setQuery(event.target.value)}
            placeholder="Search by Bill, Topic, or Action"
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
        Showing {matchingBills.length} {matchingBills.length === 1 ? "Record" : "Records"}
      </p>
      {matchingBills.length > 0 ? (
        <div className="directory-grid">
          {matchingBills.map(
            (bill: LegislativeBill): JSX.Element => (
              <BillCard bill={bill} key={`${bill.congress}-${bill.type}-${bill.number}`} />
            ),
          )}
        </div>
      ) : (
        <div className="no-results">
          <h2>No Records Match That Search.</h2>
          <p>Try a Shorter Phrase, a Bill Number, or Another Stage.</p>
        </div>
      )}

      {hasMore ? (
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
              Could Not Load More Records. Try Again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
