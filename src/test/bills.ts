import type { BillSearchResponse } from "@/lib/api-contract";
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
 * The body is typed as the route's own contract, so a field the route gains is a compile error here rather than an
 * `undefined` every suite built on this stand-in silently reads. It reports `"preview"`, which is what the route says
 * under the suite's keyless environment.
 *
 * @param bills - The matching bills.
 * @param congressesSearched - How many Congresses the sweep covered.
 * @param truncated - Whether the results were cut off.
 * @returns A stand-in `Response` whose `json()` resolves to the search body.
 */
export function searchResponse(
  bills: LegislativeBill[],
  congressesSearched: number = 27,
  truncated: boolean = false,
): Response {
  const body: BillSearchResponse = { bills, source: "preview", congressesSearched, truncated };

  return {
    ok: true,
    json: (): Promise<BillSearchResponse> => Promise.resolve(body),
  } as unknown as Response;
}
