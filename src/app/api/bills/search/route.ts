import { NextResponse } from "next/server";

import { type BillSearchResult, getSearchResults } from "@/lib/congress/client";

// NOTE: like /api/bills, this reads the request URL (the `q` query param), which a static export can't do — there's no
// server left at request time. It lives under the same src/app/api/bills directory, so the GitHub Pages static-demo
// workflow's existing `rm -rf src/app/api/bills` step (see .github/workflows/deploy-gh-pages.yml) already removes this
// route too, with no separate change needed there. BillDirectory falls back to filtering its already-loaded bills
// client-side whenever this route can't be reached — see its `matchesQuery` fallback.

/**
 * Serves a cross-Congress bill search for the bill directory's search box and the site header's search form (which
 * deep-links here via `/bills?q=...`).
 *
 * @param request - Expects a `q` query param (e.g. `/api/bills/search?q=broadband`). A missing or blank `q` returns
 *   every swept Congress's most recently active bills, since `matchesQuery` treats an empty query as matching
 *   everything — the client doesn't normally call this route with a blank query, but the route stays well-defined if it
 *   does.
 * @returns A `BillSearchResult` — never an error status; a search that can't reach live data returns the (small,
 *   labeled) preview fixture matches instead, same as every other route in this app.
 */
export async function GET(request: Request): Promise<NextResponse<BillSearchResult>> {
  const { searchParams } = new URL(request.url);
  const query: string = searchParams.get("q") ?? "";

  const result: BillSearchResult = await getSearchResults(query);

  return NextResponse.json(result);
}
