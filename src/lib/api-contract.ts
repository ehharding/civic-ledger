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
 * No runtime validation of these bodies, deliberately. Validating them would mean shipping a parser to the browser for
 * a same-origin response this app also writes, and both callers already degrade rather than trust: `useBillSearch`
 * falls back to a local filter when the route is unreachable, and "Load More" surfaces an error beside the button.
 * Untrusted input to *this* app is the request half, and that half is parsed — @see api-query.ts.
 *
 * **The request URLs live here too**, for the same reason the bodies do and not as a second concern. `api-query.ts` is
 * the natural-looking home for them and is the wrong one: it is zod-backed, and a client component that imported it to
 * spell a URL would drag schema validation into the browser bundle behind it — the same trade
 * `MAX_DIRECTORY_QUERY_LENGTH` is stated separately to avoid. This file is the half of that boundary the browser is
 * already allowed to have.
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

/**
 * The query-param names this app's own routes read and write.
 *
 * Named once for exactly the reason `COMMITTEE_DIRECTORY_PARAMS` and `COMMITTEE_RECORDS_PARAMS` are, and across a
 * boundary that is easier to break silently than either of theirs: the handler pulls these out of `request.url` and the
 * browser writes them back, in different files, in different runtimes, with nothing between them. A param renamed on
 * one side type-checks cleanly against the other and fails as a directory that pages from zero forever, or a search
 * that quietly matches everything.
 *
 * `q` rather than `query` because it is the spelling the *page* URLs already use — the site header's search form
 * deep-links to `/bills?q=…`, and the directory mirrors its box back into the address bar the same way — so the two
 * halves of one search read alike.
 */
export const BILL_API_PARAMS = {
  offset: "offset",
  congress: "congress",
  query: "q",
} as const;

/**
 * Builds the request URL for one further page of bills, e.g., `/api/bills?offset=24&congress=118`.
 *
 * The counterpart to `parseOffsetParam` and `parseCongressQueryParam`, which read back exactly what this writes. Built
 * through `URLSearchParams` rather than by concatenation so encoding is the URL layer's problem rather than the call
 * site's — the previous inline spelling appended `&congress=` by hand, which was correct only for as long as both
 * values stayed numeric.
 *
 * @param offset - How many bills the caller already holds. @see MAX_BILL_OFFSET for the bound the handler clamps to.
 * @param congress - Scopes the page to one Congress. Omitted on the default `/bills` route, where the handler already
 *   answers for the current one — so the common case produces a URL with a single param rather than one restating the
 *   default.
 * @returns The same-origin request URL. Same-origin is the point: it is what keeps `CONGRESS_API_KEY` on the server.
 */
export function billPageRequestUrl(offset: number, congress?: number): string {
  const params: URLSearchParams = new URLSearchParams({ [BILL_API_PARAMS.offset]: String(offset) });
  if (congress !== undefined) params.set(BILL_API_PARAMS.congress, String(congress));

  return `/api/bills?${params.toString()}`;
}

/**
 * Builds the request URL for one cross-Congress bill search, e.g., `/api/bills/search?q=broadband`.
 *
 * The counterpart to `parseQueryParam`, which trims and caps what this sends.
 *
 * @param query - The reader's search text, as typed. Encoded here, so a query containing `&`, `#`, or a space reaches
 *   the handler whole rather than truncated at the first one.
 * @returns The same-origin request URL.
 */
export function billSearchRequestUrl(query: string): string {
  return `/api/bills/search?${new URLSearchParams({ [BILL_API_PARAMS.query]: query }).toString()}`;
}
