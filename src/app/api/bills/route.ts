import { NextResponse } from "next/server";

import { BILL_API_PARAMS, type BillPageResponse } from "@/lib/api-contract";
import { parseCongressQueryParam, parseOffsetParam } from "@/lib/api-query";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { getMoreBills } from "@/lib/congress/client";
import { EDGE_CACHE_CONTROL, NO_STORE_CACHE_CONTROL } from "@/lib/edge-cache";

// NOTE: this route reads the request URL (the `offset` and `congress` query params), which a static export can't do —
// there's no server left at request time. The GitHub Pages static-demo workflow deletes this route before building
// (STATIC_EXPORT=true); it's harmless there anyway, since that build never has a CONGRESS_API_KEY and getMoreBills()
// already no-ops without one.

/**
 * Serves one additional page of live Congress.gov bills for the bill directory's "Load More" button, for the current
 * Congress or — from the `/bills/[congress]` route — any other one this app supports browsing.
 *
 * This exists as a server-side proxy specifically so the browser never needs, and never receives, `CONGRESS_API_KEY`.
 * The client only ever talks to this same-origin route, never to api.congress.gov directly.
 *
 * A page with bills in it is shared through the CDN for the app's cache window (see {@link EDGE_CACHE_CONTROL}), so a
 * second reader pressing "Load More" at the same offset costs no function invocation. An empty page is not, because it
 * cannot say whether the list ran out or the fetch failed — and caching a failure would leave the button dead for every
 * reader for the whole window rather than for the one request that failed.
 *
 * @param request - Expects an `offset` query param (e.g., `/api/bills?offset=12`) and an optional `congress` param
 *   (e.g., `&congress=118`). Both are parsed permissively rather than strictly: anything missing, malformed, or out of
 *   range resolves to a sensible default instead of a 400.
 * @returns A {@link BillPageResponse} — the next page, or an empty array when no API key is configured or the upstream
 *   fetch fails. Never an error status, so the client can treat "no more bills" and "couldn't load more" as the same
 *   empty page, which is exactly how the button behaves in both cases.
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
