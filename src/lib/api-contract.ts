import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/bills/model";

/**
 * The response bodies and request URLs of this app's own API routes, declared once so the handler and its caller — the
 * browser, or for `/api/health` an external probe — share one type. `api-query.ts` parses the request side.
 *
 * Isomorphic: every type resolves through pure model code, so client components can import it without reaching the
 * server adapter, and without `api-query.ts`'s zod dependency. Response bodies aren't validated at runtime — they're
 * same-origin, and both callers already degrade on failure. {@link readApiResponse} is where that trust is placed.
 */

/**
 * `/api/bills` — one further page of bills for the directory's "Load More" control.
 *
 * Always a 200 with an array, never an error status: an empty array means both "there are no more" and "we could not
 * find out", which is precisely how the button behaves in either case.
 *
 * @see the route handler for why.
 */
export type BillPageResponse = {
  /** The next page; empty when there are no more or the read failed. */
  bills: LegislativeBill[];
};

/**
 * `/api/bills/search` — the result of one cross-Congress search, and `getSearchResults`'s return type. The last three
 * fields let the UI state the search's scope.
 *
 * @see BillDirectory
 */
export type BillSearchResponse = {
  /** The matching bills, most recent first. */
  bills: LegislativeBill[];
  /** Whether these are live records or labeled placeholders. */
  source: CongressSnapshot["source"];
  /** How many Congresses this search actually swept. */
  congressesSearched: number;
  /** Whether more matches existed than the adapter's cap allows returning. */
  truncated: boolean;
};

/**
 * `/api/health` — the liveness check's fixed-shape body. Its only callers are external probes, which is why the shape
 * is declared here anyway: a probe's alert rule is as much a caller as a component is, and a renamed field breaks it as
 * silently.
 *
 * @see docs/deployment.md
 */
export type HealthResponse = {
  /** Always `"ok"`: a response at all is the liveness signal. */
  status: "ok";
  /** Always `"civic-ledger"`, so a probe pointed at the wrong deployment can tell. */
  service: "civic-ledger";
  /**
   * `"live"` when a Congress.gov key is configured, `"preview"` (labeled fixtures) otherwise.
   *
   * @see getCongressApiKey
   */
  records: CongressSnapshot["source"];
  /** When this response was generated, so a cached or stale reply is recognizable as one. */
  timestamp: string;
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
 * @param offset - How many bills the caller already holds.
 * @param congress - Scopes the page to one Congress; omitted for the current one.
 * @returns The same-origin request URL, which keeps `CONGRESS_API_KEY` on the server.
 * @see MAX_BILL_OFFSET
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

/**
 * Reads the body of a response from one of this app's own routes, as the type its handler declared above.
 *
 * The one place a body is trusted to match its declared type rather than parsed into it (see this module's header for
 * why that is safe here), so the cast is written once instead of at every `fetch`.
 *
 * @typeParam Body - The route's declared response type, e.g., {@link BillPageResponse}.
 * @param response - The response to read.
 * @returns The parsed body.
 * @throws When the response is not a 2xx, or its body is not JSON — both of which a caller treats as the request
 *   failing.
 */
export async function readApiResponse<Body>(response: Response): Promise<Body> {
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);

  return (await response.json()) as Body;
}
