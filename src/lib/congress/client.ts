/**
 * The Congress.gov adapter's public surface.
 *
 * This module used to hold the entire adapter — transport, schemas, mappers, bills, and members — in one ~840-line
 * file. That has since been split by responsibility, but the split is deliberately invisible to callers: every route,
 * component, and test still imports from `@/lib/congress/client`, so the internal layout can keep evolving without a
 * churn of import rewrites across the app.
 *
 * Where things now live:
 *
 * | Module          | Responsibility                                                              |
 * |-----------------|-----------------------------------------------------------------------------|
 * | `api-schema.ts` | Runtime shapes for Congress.gov v3 payloads — the untrusted-input boundary. |
 * | `http.ts`       | Key access, URL building, caching policy, one request helper, route guards. |
 * | `mappers.ts`    | Upstream shapes to this app's stable model. Pure; no I/O.                   |
 * | `bills.ts`      | Bill snapshots, pagination, lookup, summaries, text versions, search.       |
 * | `composition.ts`| Chamber membership, including the member list's pagination.                 |
 *
 * Everything re-exported here shares two guarantees: it never throws (upstream failure is an expected condition, not an
 * exception), and anything that can come from either live or preview data reports which it was, on the returned value
 * itself.
 *
 * @see docs/architecture.md for how this layer fits into the app as a whole.
 */

export {
  type BillLookupResult,
  type BillSearchResult,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
  getCongressSnapshot,
  getCongressSnapshotForCongress,
  getMoreBills,
  getSearchResults,
} from "@/lib/congress/bills";
export { getCongressComposition } from "@/lib/congress/composition";
export { getCongressApiKey, REVALIDATE_SECONDS } from "@/lib/congress/http";
