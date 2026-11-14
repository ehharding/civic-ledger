import { NextResponse } from "next/server";

import { BILL_API_PARAMS, type BillSearchResponse } from "@/lib/api-contract";
import { parseQueryParam } from "@/lib/api-query";
import { getSearchResults } from "@/lib/congress/client";
import { EDGE_CACHE_CONTROL } from "@/lib/edge-cache";

// NOTE: like /api/bills, this reads the request URL (the `q` query param), which a static export can't do — there's no
// server left at request time. It lives under the same src/app/api/bills directory, so the GitHub Pages static-demo
// workflow's existing `rm -rf src/app/api/bills` step (see .github/workflows/deploy-gh-pages.yml) already removes this
// route too, with no separate change needed there. BillDirectory falls back to filtering its already-loaded bills
// client-side whenever this route can't be reached — see useBillSearch.

/**
 * Serves a cross-Congress bill search for the bill directory's search box and the site header's search form, which
 * deep-links here via `/bills?q=…`.
 *
 * @param request - Expects a `q` query param (e.g., `/api/bills/search?q=broadband`), trimmed and length-capped by
 *   {@link parseQueryParam}. A missing or blank `q` returns every swept Congress's most recently active bills, since
 *   `matchesQuery` treats an empty query as matching everything — the client doesn't normally call this with a blank
 *   query, but the route stays well-defined if it does.
 * @returns A {@link BillSearchResponse}, including how many Congresses were swept and whether results were truncated,
 *   so the UI can describe the scope of what it just searched. Never an error status: a search that can't reach live
 *   data returns the small, labeled preview matches instead, same as every other data path in this app.
 *
 * Every response is shared through the CDN for the app's cache window, keyed by the query (@see EDGE_CACHE_CONTROL):
 * this is the most expensive call the app answers, and a popular query is asked by many readers. Unlike `/api/bills`,
 * an empty result is cached too — "no bill matches this" is the common answer to a typo, not a sign of failure, and a
 * sweep that lost some Congresses to an outage is held for no longer than an ISR page that fell back to preview data.
 */
export async function GET(request: Request): Promise<NextResponse<BillSearchResponse>> {
  const { searchParams } = new URL(request.url);
  const query: string = parseQueryParam(searchParams.get(BILL_API_PARAMS.query));

  const result: BillSearchResponse = await getSearchResults(query);

  return NextResponse.json(result, { headers: { "Cache-Control": EDGE_CACHE_CONTROL } });
}
