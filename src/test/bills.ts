import type { LegislativeBill } from "@/lib/congress/bills/model";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";

/** Builders for bill-shaped test data, shared by the bill directory, search, and search-hook suites. */

/**
 * The first preview bill with `overrides` applied, so a test states only the fields its assertion is about.
 *
 * @param overrides - The fields the test cares about.
 * @returns A complete bill record.
 */
export function makeBill(overrides: Partial<LegislativeBill>): LegislativeBill {
  return { ...firstPreviewBill, ...overrides };
}

/**
 * A resolved `/api/bills/search` response, in the shape the route returns. A plain object rather than a real
 * `Response`, so one mock can answer any number of calls without its body being consumed.
 *
 * @param bills - The matching bills.
 * @param congressesSearched - How many Congresses the sweep covered.
 * @param truncated - Whether the results were cut off.
 * @returns A stand-in `Response` whose `json()` resolves to the search body.
 */
export function searchResponse(bills: LegislativeBill[], congressesSearched = 27, truncated = false): Response {
  return {
    ok: true,
    json: (): Promise<unknown> => Promise.resolve({ bills, congressesSearched, truncated }),
  } as unknown as Response;
}
