import { NextResponse } from "next/server";

import { BILL_API_PARAMS, type BillPageResponse } from "@/lib/api-contract";
import { parseCongressQueryParam, parseOffsetParam } from "@/lib/api-query";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { getMoreBills } from "@/lib/congress/client";
import { EDGE_CACHE_CONTROL, NO_STORE_CACHE_CONTROL } from "@/lib/edge-cache";

// Reads the request URL, which a static export can't. The GitHub Pages static-demo workflow (STATIC_EXPORT=true)
// deletes this route before building; that build has no CONGRESS_API_KEY, so getMoreBills() would no-op anyway.

/**
 * Serves one more page of live bills for the bill directory's "Load More" button, for the current Congress or — from
 * `/bills/[congress]` — any other browsable one. A same-origin proxy, so the browser never receives `CONGRESS_API_KEY`.
 *
 * A non-empty page is CDN-cached for the app's window (see {@link EDGE_CACHE_CONTROL}), so a second reader at the same
 * offset costs no invocation. An empty page is not: it can't say whether the list ran out or the fetch failed, and
 * caching a failure would leave the button dead for every reader for the whole window.
 *
 * @param request - Carries `offset` (e.g., `?offset=12`) and an optional `congress` (e.g., `&congress=118`), both
 *   parsed permissively: anything missing, malformed, or out of range falls back to a default rather than a 400.
 * @returns A {@link BillPageResponse}: the next page, or an empty one when no key is configured or the fetch fails.
 *   Never an error status — the button treats "no more bills" and "couldn't load more" alike.
 * @see parseOffsetParam
 * @see parseCongressQueryParam
 */
export async function GET(request: Request): Promise<NextResponse<BillPageResponse>> {
  const { searchParams } = new URL(request.url);

  const offset: number = parseOffsetParam(searchParams.get(BILL_API_PARAMS.offset));
  const congress: number = parseCongressQueryParam(searchParams.get(BILL_API_PARAMS.congress));

  const bills: LegislativeBill[] = await getMoreBills(offset, congress);

  return NextResponse.json(
    { bills },
    { headers: { "Cache-Control": bills.length > 0 ? EDGE_CACHE_CONTROL : NO_STORE_CACHE_CONTROL } },
  );
}
