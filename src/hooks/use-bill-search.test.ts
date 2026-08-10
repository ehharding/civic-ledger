/**
 * Covers useBillSearch's asynchronous behavior directly, rather than only through the directory that renders it.
 *
 * The hook's own documentation names three failure modes it exists to prevent — wasted requests while typing, a stale
 * response overwriting a fresher one, and search going dead where the route isn't reachable — and each of those is a
 * race, which is exactly the kind of thing that keeps working by accident until it doesn't. So each one gets a test
 * that fails if the guard is removed: the debounce is observed by advancing a clock, the supersede case resolves an
 * aborted request *after* its replacement has already answered, and the fallback path asserts both the narrowed results
 * and the `degraded` flag that makes the UI admit it.
 *
 * Fake timers throughout, since the alternative is a suite that waits a real third of a second per search.
 */
import { act, type RenderHookResult, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BillSearchState, SEARCH_DEBOUNCE_MS, useBillSearch } from "@/hooks/use-bill-search";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { previewBills } from "@/lib/congress/upstream/fixtures";

const [firstBill, secondBill] = previewBills as [LegislativeBill, LegislativeBill];

/** A resolved `/api/bills/search` response body, in the shape the route actually returns. */
function searchResponse(bills: LegislativeBill[], congressesSearched = 27, truncated = false): Response {
  return {
    ok: true,
    json: (): Promise<unknown> => Promise.resolve({ bills, congressesSearched, truncated }),
  } as unknown as Response;
}

type HookProps = { query: string; fallback: LegislativeBill[] };

function renderSearch(
  initialProps: HookProps = { query: "", fallback: previewBills },
): RenderHookResult<BillSearchState, HookProps> {
  return renderHook(({ query, fallback }: HookProps): BillSearchState => useBillSearch(query, fallback), {
    initialProps,
  });
}

/** Advances past the debounce window and lets the resulting promise chain settle. */
async function flushDebounce(): Promise<void> {
  await act(async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  });
}

beforeEach((): void => {
  vi.useFakeTimers();
});

afterEach((): void => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useBillSearch", (): void => {
  it("performs no request at all for an empty or whitespace-only query", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderSearch({ query: "   ", fallback: previewBills });
    await flushDebounce();

    expect(fetchMock).not.toHaveBeenCalled();
    // `null` results is the "not searching" state, which is deliberately distinct from "searched and found nothing".
    expect(result.current.results).toBeNull();
    expect(result.current.isSearching).toBe(false);

    rerender({ query: "", fallback: previewBills });
    await flushDebounce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acknowledges the keystroke immediately but holds the request until the debounce elapses", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([firstBill]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderSearch({ query: "broadband", fallback: previewBills });

    // Set before the timer, not after: the UI should show it is working rather than appear to ignore the keystroke.
    expect(result.current.isSearching).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of keystrokes into one request for the final query", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([firstBill]));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderSearch({ query: "b", fallback: previewBills });

    for (const query of ["br", "bro", "broad"]) {
      await act(async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(50);
      });
      rerender({ query, fallback: previewBills });
    }

    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bills/search?q=broad",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("percent-encodes the query rather than pasting it into the URL", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    renderSearch({ query: "clean air & water", fallback: previewBills });
    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledWith("/api/bills/search?q=clean%20air%20%26%20water", expect.anything());
  });

  it("reports the server's results and the scope it actually swept", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([firstBill], 27, true)));

    const { result } = renderSearch({ query: "broadband", fallback: previewBills });
    await flushDebounce();

    expect(result.current.isSearching).toBe(false);
    expect(result.current.results).toEqual([firstBill]);
    expect(result.current.meta).toEqual({ congressesSearched: 27, truncated: true });
    expect(result.current.degraded).toBe(false);
  });

  it("distinguishes a search that found nothing from no search at all", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([])));

    const { result } = renderSearch({ query: "nothing matches this", fallback: previewBills });
    await flushDebounce();

    expect(result.current.results).toEqual([]);
    expect(result.current.degraded).toBe(false);
  });

  it("returns to the plain browse listing when the query is cleared", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([firstBill], 27, true)));

    const { result, rerender } = renderSearch({ query: "broadband", fallback: previewBills });
    await flushDebounce();
    expect(result.current.results).toEqual([firstBill]);

    rerender({ query: "", fallback: previewBills });

    expect(result.current.results).toBeNull();
    expect(result.current.meta).toBeNull();
    expect(result.current.degraded).toBe(false);
    expect(result.current.isSearching).toBe(false);
  });

  describe("when the search route can't be reached", (): void => {
    it("falls back to filtering the bills already loaded, and says so", async (): Promise<void> => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      const { result } = renderSearch({ query: firstBill.title, fallback: previewBills });
      await flushDebounce();

      expect(result.current.degraded).toBe(true);
      expect(result.current.results).toEqual([firstBill]);
      // No meta, because nothing was swept — claiming a Congress count here would be inventing one.
      expect(result.current.meta).toBeNull();
      expect(result.current.isSearching).toBe(false);
    });

    it("treats a non-OK status the same as an unreachable route", async (): Promise<void> => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response));

      const { result } = renderSearch({ query: firstBill.title, fallback: previewBills });
      await flushDebounce();

      expect(result.current.degraded).toBe(true);
      expect(result.current.results).toEqual([firstBill]);
    });

    it("filters against the newest fallback list, without that list re-triggering a search", async (): Promise<void> => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);

      // Mid-flight, the page appends a "Load More" page. That must not re-run the search…
      const { result, rerender } = renderSearch({ query: secondBill.title, fallback: [firstBill] });
      rerender({ query: secondBill.title, fallback: [firstBill, secondBill] });

      await flushDebounce();

      expect(result.current.degraded).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // …but the fallback still filters the list as it stands now, not the one captured when the search began.
      expect(result.current.results).toEqual([secondBill]);
    });
  });

  describe("when a search is superseded", (): void => {
    it("aborts the in-flight request", async (): Promise<void> => {
      const signals: AbortSignal[] = [];
      const fetchMock = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }): Promise<Response> => {
        signals.push(init.signal);
        return new Promise<Response>((): void => {
          // Never settles: this is the request that gets abandoned.
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const { rerender } = renderSearch({ query: "broadband", fallback: previewBills });
      await flushDebounce();

      expect(signals[0]?.aborted).toBe(false);

      rerender({ query: "rural", fallback: previewBills });
      expect(signals[0]?.aborted).toBe(true);
    });

    it("does not let a late response overwrite the newer one that already answered", async (): Promise<void> => {
      let resolveStale: ((response: Response) => void) | undefined;

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(
          (): Promise<Response> =>
            new Promise<Response>((resolve: (response: Response) => void): void => {
              resolveStale = resolve;
            }),
        )
        .mockResolvedValue(searchResponse([secondBill]));
      vi.stubGlobal("fetch", fetchMock);

      const { result, rerender } = renderSearch({ query: "broadband", fallback: previewBills });
      await flushDebounce();

      rerender({ query: "rural", fallback: previewBills });
      await flushDebounce();
      expect(result.current.results).toEqual([secondBill]);
      // The abandoned first request finally arrives. Its controller is aborted, so it must be ignored entirely.
      await act(async (): Promise<void> => {
        resolveStale?.(searchResponse([firstBill]));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.results).toEqual([secondBill]);
      expect(result.current.isSearching).toBe(false);
    });

    it("ignores a superseded request that rejects, rather than treating the abort as an outage", async (): Promise<void> => {
      // The other half of the supersede case: a real abort makes `fetch` *reject*, and without the guard that rejection
      // would land in the fallback path and flip `degraded` on — telling the reader that broader search is unavailable
      // at the exact moment it succeeded.
      let rejectStale: ((reason: Error) => void) | undefined;

      const fetchMock = vi
        .fn()
        .mockImplementationOnce(
          (): Promise<Response> =>
            new Promise<Response>((_resolve: (response: Response) => void, reject: (reason: Error) => void): void => {
              rejectStale = reject;
            }),
        )
        .mockResolvedValue(searchResponse([secondBill]));
      vi.stubGlobal("fetch", fetchMock);

      const { result, rerender } = renderSearch({ query: "broadband", fallback: previewBills });
      await flushDebounce();

      rerender({ query: "rural", fallback: previewBills });
      await flushDebounce();
      expect(result.current.results).toEqual([secondBill]);

      await act(async (): Promise<void> => {
        rejectStale?.(new DOMException("The user aborted a request.", "AbortError"));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.results).toEqual([secondBill]);
      expect(result.current.degraded).toBe(false);
      expect(result.current.isSearching).toBe(false);
    });

    it("cancels a pending request on unmount rather than leaving it to settle", async (): Promise<void> => {
      const signals: AbortSignal[] = [];
      const fetchMock = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }): Promise<Response> => {
        signals.push(init.signal);
        return new Promise<Response>((): void => {});
      });
      vi.stubGlobal("fetch", fetchMock);

      const { unmount } = renderSearch({ query: "broadband", fallback: previewBills });
      await flushDebounce();

      unmount();

      expect(signals[0]?.aborted).toBe(true);
    });

    it("never fires a request for a query the reader typed past before the debounce elapsed", async (): Promise<void> => {
      const fetchMock = vi.fn().mockResolvedValue(searchResponse([]));
      vi.stubGlobal("fetch", fetchMock);

      const { rerender } = renderSearch({ query: "broadband", fallback: previewBills });
      rerender({ query: "", fallback: previewBills });

      await flushDebounce();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
