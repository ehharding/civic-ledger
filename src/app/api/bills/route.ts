import { NextResponse } from "next/server";

import type { BillPageResponse } from "@/lib/api-contract";
import { parseCongressQueryParam, parseOffsetParam } from "@/lib/api-query";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { getMoreBills } from "@/lib/congress/client";

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
 * @param request - Expects an `offset` query param (e.g., `/api/bills?offset=12`) and an optional `congress` param
 *   (e.g., `&congress=118`). Both are parsed permissively rather than strictly: anything missing, malformed, or out of
 *   range resolves to a sensible default instead of a 400.
 *   @see parseOffsetParam
 *   @see parseCongressQueryParam
 * @returns A {@link BillPageResponse} — the next page, or an empty array when no API key is configured or the upstream
 *   fetch fails. Never an error status, so the client can treat "no more bills" and "couldn't load more" as the same
 *   empty page, which is exactly how the button behaves in both cases.
 */
export async function GET(request: Request): Promise<NextResponse<BillPageResponse>> {
  const { searchParams } = new URL(request.url);

  const offset: number = parseOffsetParam(searchParams.get("offset"));
  const congress: number = parseCongressQueryParam(searchParams.get("congress"));

  const bills: LegislativeBill[] = await getMoreBills(offset, congress);

  return NextResponse.json({ bills });
}
