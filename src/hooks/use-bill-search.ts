"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { type BillSearchResponse, billSearchRequestUrl, readApiResponse } from "@/lib/api-contract";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { matchesQuery } from "@/lib/congress/bills/search";

/**
 * How long to wait after the user stops typing before firing a search request, so each keystroke doesn't.
 *
 * Exported because the debounce window is part of this hook's observable contract rather than an implementation detail:
 * a caller's tests have to advance a clock by exactly this much to observe a request, and a second copy of the number
 * living in a test file is one that can quietly stop matching this one.
 */
export const SEARCH_DEBOUNCE_MS: number = 300;

/** What a search actually covered, for the scope note shown beneath the results. */
export type BillSearchMeta = {
  /** How many Congresses the sweep covered. */
  congressesSearched: number;
  /** Whether more matches existed than were returned. */
  truncated: boolean;
};

/** Everything a caller needs to render a search's progress, results, and honest description of its own scope. */
export type BillSearchState = {
  /** Matching bills, or `null` when no search is active — which is distinct from "a search that found nothing". */
  results: LegislativeBill[] | null;
  /** Whether a request is in flight, including during the debounce window. */
  isSearching: boolean;
  /** What the server-side sweep covered, or `null` when the results came from the local fallback. */
  meta: BillSearchMeta | null;
  /** Whether the search route was unreachable and these results are the narrower local fallback. */
  degraded: boolean;
};

/**
 * Runs the bill directory's debounced, cross-Congress search:
 *
 * - **Debounced** by `SEARCH_DEBOUNCE_MS` after the last keystroke.
 * - **Cancels superseded requests** with an `AbortController`, so stale results can't overwrite fresh ones.
 * - **Degrades** when the route is unreachable (the static demo), filtering the loaded bills with the same
 *   `matchesQuery` rules and setting `degraded` so the UI says so.
 *
 * @param query - The raw search text, as typed. Trimmed internally; an empty or all-whitespace query performs no
 *   request at all and resets to the plain browse listing.
 * @param fallbackBills - The bills already loaded on the page, used only for the degraded local fallback. Read through
 *   a ref, so appending a page of "Load More" results cannot re-trigger an in-flight search.
 * @returns The current {@link BillSearchState}.
 */
export function useBillSearch(query: string, fallbackBills: LegislativeBill[]): BillSearchState {
  const [results, setResults] = useState<LegislativeBill[] | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [meta, setMeta] = useState<BillSearchMeta | null>(null);
  const [degraded, setDegraded] = useState<boolean>(false);

  /**
   * The fallback list, held in a ref rather than read from the closure.
   *
   * If the search effect depended on `fallbackBills` directly, every "Load More" append would change that array
   * identity and re-run the effect — firing a duplicate request for a query the user hasn't touched. The fallback is
   * only ever needed at the moment a request fails, so a ref is exactly right: always current when read, never a reason
   * to re-run.
   */
  const fallbackRef: RefObject<LegislativeBill[]> = useRef(fallbackBills);

  useEffect((): void => {
    fallbackRef.current = fallbackBills;
  }, [fallbackBills]);

  const trimmedQuery: string = query.trim();

  useEffect((): (() => void) | undefined => {
    if (!trimmedQuery) {
      setResults(null);
      setMeta(null);
      setDegraded(false);
      setIsSearching(false);
      return;
    }

    // Set immediately, not after the debounce, so the UI acknowledges the keystroke rather than appearing to ignore it
    // for a third of a second.
    setIsSearching(true);

    const controller: AbortController = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout((): void => {
      fetch(billSearchRequestUrl(trimmedQuery), { signal: controller.signal })
        .then((response: Response): Promise<BillSearchResponse> => readApiResponse<BillSearchResponse>(response))
        .then((payload: BillSearchResponse): void => {
          if (controller.signal.aborted) return;

          setResults(payload.bills);
          setMeta({ congressesSearched: payload.congressesSearched, truncated: payload.truncated });
          setDegraded(false);
        })
        .catch((): void => {
          // An abort is this hook superseding itself, not a failure — the newer run owns the state from here.
          if (controller.signal.aborted) return;

          setResults(fallbackRef.current.filter((bill: LegislativeBill): boolean => matchesQuery(bill, trimmedQuery)));
          setMeta(null);
          setDegraded(true);
        })
        .finally((): void => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return (): void => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedQuery]);

  return { results, isSearching, meta, degraded };
}
