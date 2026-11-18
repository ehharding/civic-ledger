import { NextResponse } from "next/server";

import { BILL_API_PARAMS, type BillSearchResponse } from "@/lib/api-contract";
import { parseQueryParam } from "@/lib/api-query";
import { getSearchResults } from "@/lib/congress/client";
import { EDGE_CACHE_CONTROL } from "@/lib/edge-cache";

// NOTE: like /api/bills, this reads the request URL (the `q` query param), which a static export can't do — there's no
// server left at request time. It lives under the same src/app/api/bills directory, so the static-demo build's
// `rm -rf src/app/api/bills` step (in .github/actions/build-static-demo) removes this route too. BillDirectory falls
// back to filtering its already-loaded bills client-side whenever this route can't be reached — see useBillSearch.

/**
 * Serves a cross-Congress bill search for the bill directory's search box and the site header's search form, which
 * deep-links here via `/bills?q=…`.
 *
 * Every response is shared through the CDN for the app's cache window, keyed by the query (see
 * {@link EDGE_CACHE_CONTROL}): this is the most expensive call the app answers, and a popular query is asked by many
 * readers. Unlike `/api/bills`, an empty result is cached too — "no bill matches this" is the common answer to a typo,
 * not a sign of failure, and a sweep that lost some Congresses to an outage is held for no longer than an ISR page that
 * fell back to preview data.
 *
 * @param request - Expects a `q` query param (e.g., `/api/bills/search?q=broadband`), trimmed and length-capped by
 *   {@link parseQueryParam}. A blank `q` matches everything, returning every swept Congress's most recently active
 *   bills.
 * @returns A {@link BillSearchResponse}, including how many Congresses were swept and whether results were truncated,
 *   so the UI can describe the scope of what it just searched. Never an error status: a search that can't reach live
 *   data returns the labeled preview matches instead.
 */
export async function GET(request: Request): Promise<NextResponse<BillSearchResponse>> {
  const { searchParams } = new URL(request.url);
  const query: string = parseQueryParam(searchParams.get(BILL_API_PARAMS.query));

  const result: BillSearchResponse = await getSearchResults(query);

  return NextResponse.json(result, { headers: { "Cache-Control": EDGE_CACHE_CONTROL } });
}
