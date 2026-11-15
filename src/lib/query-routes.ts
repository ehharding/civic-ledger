/**
 * Which routes have a server-rendered twin for URLs that carry a view in their query string, and the rewrites that send
 * those URLs to it.
 *
 * **Why the twin exists.** A page that reads `searchParams` renders on every visit, which Vercel meters as Active CPU
 * (docs/deployment.md, "Keeping Server Work Bounded"). So each directory, and a committee's record view, comes in two
 * halves: the route never reads its query and is static on the five-minute window, while its twin under `/query` reads
 * the query and renders on demand. The rewrite keeps the shareable URL in the address bar, and a shared link still
 * arrives narrowed on first paint. @see docs/architecture.md, "A Narrowed Directory Is a Place, So It Has a URL".
 *
 * **Why rewrites rather than a Proxy.** A Proxy is a function invocation per request; a rewrite with a `has` condition
 * is evaluated by the platform before any function runs. `has` matches one query key per rule, so each route gets one
 * rule per key it understands — and a query it ignores (`?utm_source=`) is served the static page.
 *
 * **Why the keys are restated rather than imported.** `next.config.ts` imports this module before the `@/` alias
 * exists, so it can import nothing from the app. `query-routes.test.ts` holds the keys equal to each parser's
 * `*_PARAMS` constant instead.
 */

/** The path prefix every twin route lives under. Also disallowed in `robots.txt`; nothing should link here. */
export const QUERY_ROUTE_PREFIX = "/query" as const;

/** One route with a query-aware twin: its path pattern, and every query key that changes what it renders. */
export type QueryRoute = {
  /** A `next.config.ts` rewrite source, e.g., `"/bills/:congress"`. */
  readonly source: string;
  /** The query keys that route's parser reads. A URL carrying any one of them is sent to the twin. */
  readonly keys: readonly string[];
};

/** Every route with a twin. @see each route's `*_PARAMS` constant, which `query-routes.test.ts` holds these to. */
export const QUERY_ROUTES: readonly QueryRoute[] = [
  { source: "/bills", keys: ["q", "stage"] },
  { source: "/bills/:congress", keys: ["q", "stage"] },
  { source: "/members", keys: ["q", "chamber", "party", "state", "sort"] },
  { source: "/committees", keys: ["q", "chamber", "type", "sort"] },
  { source: "/committees/:chamber/:systemCode", keys: ["records", "page"] },
];

/** The shape of one `next.config.ts` rewrite rule, as far as this module builds it. */
export type QueryRewrite = {
  /** The path pattern to match. */
  source: string;
  /** Query params whose presence triggers the rewrite. */
  has: { type: "query"; key: string }[];
  /** The `/query` twin to rewrite to. */
  destination: string;
};

/**
 * Builds the rewrites that send a query-carrying URL to its route's twin.
 *
 * These must be `beforeFiles` rewrites. The default (`afterFiles`) list is only consulted once no page has matched, and
 * every source here *is* a page, so an `afterFiles` rule would never fire and every narrowed link would quietly render
 * the unfiltered static view.
 *
 * @returns One rule per route per key. The query string is carried to the destination unchanged.
 */
export function queryRewrites(): QueryRewrite[] {
  return QUERY_ROUTES.flatMap((route: QueryRoute): QueryRewrite[] =>
    route.keys.map(
      (key: string): QueryRewrite => ({
        source: route.source,
        has: [{ type: "query", key }],
        destination: `${QUERY_ROUTE_PREFIX}${route.source}`,
      }),
    ),
  );
}
