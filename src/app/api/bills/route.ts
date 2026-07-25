import { NextResponse } from "next/server";

import { getMoreBills } from "@/lib/congress/client";
import { isValidCongress } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { LegislativeBill } from "@/lib/congress/types";

// NOTE: this route reads the request URL (the `offset` and `congress` query params), which a static export can't do —
// there's no server left at request time. The GitHub Pages static-demo workflow deletes this route before building
// (STATIC_EXPORT=true); it's harmless there anyway, since that build never has a CONGRESS_API_KEY and getMoreBills()
// already no-ops without one.

/**
 * Serves one additional page of live Congress.gov bills for the bill directory's "Load More" button, for the current
 * Congress or (from the /bills/[congress] route) any other one this app supports browsing.
 *
 * This exists as a server-side proxy specifically so the browser never needs (and never receives)
 * `CONGRESS_API_KEY` — the client only ever talks to this same-origin route, never to api.congress.gov directly.
 *
 * @param request - Expects an `offset` query param (e.g. `/api/bills?offset=12`), and an optional `congress` param
 *   (e.g., `&congress=118`). Missing or non-numeric `offset` falls back to `0`; a missing or out-of-range `congress`
 *   falls back to the current Congress.
 * @returns `{ bills: [] }` when no API key is configured, or the fetch fails — never an error status, so the client can
 *   treat "no more bills" and "couldn't load more" consistently as an empty page.
 */
export async function GET(request: Request): Promise<NextResponse<{ bills: LegislativeBill[] }>> {
  const { searchParams } = new URL(request.url);
  const offset: number = Math.max(0, Number(searchParams.get("offset")) || 0);
  const requestedCongress: number = Number(searchParams.get("congress"));
  const congress: number = isValidCongress(requestedCongress) ? requestedCongress : getCurrentCongress();

  const bills: LegislativeBill[] = await getMoreBills(offset, congress);

  return NextResponse.json({ bills });
}
