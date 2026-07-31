"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { matchesQuery } from "@/lib/congress/search";
import type { LegislativeBill } from "@/lib/congress/types";

/**
 * How long to wait after the user stops typing before firing a search request, so each keystroke doesn't.
 *
 * Exported because the debounce window is part of this hook's observable contract rather than an implementation
 * detail: a caller's tests have to advance a clock by exactly this much to observe a request, and a second copy of the
 * number living in a test file is one that can quietly stop matching this one.
 */
export const SEARCH_DEBOUNCE_MS: number = 300;

/**
 * Shape of `/api/bills/search`'s JSON response, kept in sync with `BillSearchResult` in the adapter.
 *
 * Declared here rather than imported from `@/lib/congress/client`, deliberately: that module is server-only (it reads
 * `CONGRESS_API_KEY` and calls Congress.gov directly), so anything running in the browser depends only on the
 * isomorphic `@/lib/congress/types` and `@/lib/congress/search` modules and never risks pulling the adapter — and the
 * key it reads — into a client bundle.
 */
type SearchResponse = {
  bills: LegislativeBill[];
  congressesSearched: number;
  truncated: boolean;
};

/** What a search actually covered, for the scope note shown beneath the results. */
export type BillSearchMeta = {
  congressesSearched: number;
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
 * Runs the bill directory's debounced, cross-Congress search.
 *
 * Extracted from `BillDirectory` so the component is left rendering and the asynchronous behavior — debouncing,
 * cancellation, out-of-order responses, and the offline fallback — is described and tested in one place rather than
 * interleaved with JSX.
 *
 * Three failure modes this guards against, all of which are easy to reintroduce by hand:
 *
 * - **Wasted requests while typing.** Nothing is sent until `SEARCH_DEBOUNCE_MS` after the last keystroke.
 * - **Stale results overwriting fresh ones.** Each effect run owns an `AbortController`; superseded requests are
 *   aborted rather than left to resolve and overwrite a newer answer.
 * - **Search going dead when the route isn't there.** The static GitHub Pages demo has no server at request time, so an
 *   unreachable route falls back to filtering the bills already loaded, using the same `matchesQuery` rules the server
 *   sweep uses. Narrower, but still useful — and `degraded` lets the UI say so instead of quietly implying it searched
 *   everything.
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
      fetch(`/api/bills/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then((response: Response): Promise<SearchResponse> => {
          if (!response.ok) throw new Error(`Request failed with ${response.status}`);
          return response.json() as Promise<SearchResponse>;
        })
        .then((payload: SearchResponse): void => {
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
