import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/bills/model";

/**
 * The response bodies and request URLs of this app's own API routes, declared once so the handler and the browser
 * caller share one type. `api-query.ts` parses the request side.
 *
 * Isomorphic: every type resolves through pure model code, so client components can import it without reaching the
 * server adapter, and without `api-query.ts`'s zod dependency. Response bodies aren't validated at runtime — they're
 * same-origin, and both callers already degrade on failure.
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
 * `/api/bills/search` — the result of one cross-Congress search, and `getSearchResults`'s return type. The last three
 * fields let the UI state the search's scope. @see BillDirectory
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
 * The query-param names this app's API routes read and the browser writes, named once so they can't drift. `q` matches
 * the page URLs (`/bills?q=…`).
 */
export const BILL_API_PARAMS = {
  offset: "offset",
  congress: "congress",
  query: "q",
} as const;

/**
 * Builds the request URL for one further page of bills, e.g., `/api/bills?offset=24&congress=118`. Read back by
 * `parseOffsetParam` and `parseCongressQueryParam`.
 *
 * @param offset - How many bills the caller already holds. @see MAX_BILL_OFFSET
 * @param congress - Scopes the page to one Congress; omitted for the current one.
 * @returns The same-origin request URL, which keeps `CONGRESS_API_KEY` on the server.
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
