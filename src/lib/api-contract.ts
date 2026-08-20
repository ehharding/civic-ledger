import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/bills/model";

/**
 * The response bodies this app's own route handlers return, declared once and read from both sides of the wire.
 *
 * The counterpart to `api-query.ts`, which owns the other half of the same boundary: that file states what a request to
 * these routes may contain, this one states what comes back. Between them the whole of `/api/bills` and
 * `/api/bills/search` is described in `src/lib` rather than half-described in `src/app/api` and half-restated wherever
 * a `fetch` happens to land.
 *
 * **Why the shapes need a file of their own.** A response body arriving over `fetch` is `any` until someone says
 * otherwise, and both of these routes are called by a browser. Stated separately at each end, the two statements are
 * only ever as true as the last person to change one of them: a field renamed in the handler type-checks cleanly
 * against a caller still describing the old shape, and fails in a browser as an undefined read. Here the handler
 * annotates its `NextResponse<…>` and the caller reads that same declaration, so there is nothing to keep in sync.
 *
 * **Isomorphic on purpose.** Every type here resolves through `congress/bills/model.ts`, which is pure data with no
 * transport in it. That is what makes the file safe for a client component to import: the adapter these shapes come
 * out of reads `CONGRESS_API_KEY` and calls Congress.gov directly, and nothing in a browser bundle may reach it.
 * Sharing one declaration across that boundary takes a module the browser is allowed to have, which is this one.
 *
 * Types only, deliberately. Validating these bodies at runtime would mean shipping a parser to the browser for a
 * same-origin response this app also writes, and both callers already degrade rather than trust: `useBillSearch` falls
 * back to a local filter when the route is unreachable, and "Load More" surfaces an error beside the button. Untrusted
 * input to *this* app is the request half, and that half is parsed — @see api-query.ts.
 */

/**
 * `/api/bills` — one further page of bills for the directory's "Load More" control.
 *
 * Always a 200 with an array, never an error status: an empty array means both "there are no more" and "we could not
 * find out", which is precisely how the button behaves in either case. @see the route handler for why.
 */
export type BillPageResponse = {
  bills: LegislativeBill[];
};

/**
 * `/api/bills/search` — the result of one cross-Congress bill search.
 *
 * Also the return type of `getSearchResults` in the adapter, rather than a separate wire shape mapped from it: the
 * route handler is a `NextResponse.json` of exactly what that function returns, and describing the two as different
 * types would be describing a translation step that does not exist.
 *
 * The last three fields are what let the UI describe the *scope* of what it just searched instead of implying it swept
 * everything — @see the scope note in `BillDirectory`.
 */
export type BillSearchResponse = {
  bills: LegislativeBill[];
  source: CongressSnapshot["source"];
  /** How many Congresses this search actually swept. */
  congressesSearched: number;
  /** Whether more matches existed than the adapter's cap allows returning. */
  truncated: boolean;
};
