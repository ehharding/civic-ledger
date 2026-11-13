/**
 * Which routes have a server-rendered twin for URLs that carry a view in their query string, and the rewrites that send
 * those URLs to it.
 *
 * **Why the twin exists.** A page that reads `searchParams` renders on demand: Next cannot prerender it, so every visit
 * runs a server render. For the three directories and a committee's record view that used to mean *every* visit,
 * including the large majority that carry no query at all — a reader landing on `/members`, or a crawler walking the
 * sitemap. On Vercel that is metered as Fluid Active CPU, and it is what took this project over the Hobby plan's
 * fair-use limit (docs/deployment.md, "Keeping Server Work Bounded").
 *
 * So each of those routes now comes in two halves. The route itself never reads its query, which makes it static and
 * revalidated on the shared five-minute window: one render serves every visitor. Its twin under `/query` is the old
 * route, query and all, and is reached only through the rewrites below — a rewrite, not a redirect, so the address bar
 * keeps the shareable URL the reader asked for. A shared link still arrives already narrowed on its first paint,
 * rendered by the server rather than narrowed after hydration. @see docs/architecture.md, "A Narrowed Directory Is a
 * Place, So It Has a URL".
 *
 * **Why these are `next.config.ts` rewrites rather than a Proxy.** A Proxy is a function invocation on every request it
 * matches, which is a smaller version of the cost this exists to remove. A rewrite with a `has` condition is a routing
 * rule the platform evaluates before any function runs, so the static half costs nothing per request and the twin costs
 * exactly what the old route did. The catch is that `has` matches one named query key per rule, so each route gets one
 * rule per key it understands — which is also the right behavior: a query the page ignores, such as `?utm_source=`,
 * should be served the static page, not pay for a render that would produce the same thing.
 *
 * **Why the keys are written out here rather than imported.** `next.config.ts` imports this module, and the config is
 * loaded by Node before the app's `@/` path alias exists — so this file can import nothing from the app. The keys are
 * stated a second time instead, and `query-routes.test.ts` holds them equal to each parser's own `*_PARAMS` constant,
 * so a param added to a parser fails a test until its rewrite exists rather than silently rendering the static view.
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
  source: string;
  has: { type: "query"; key: string }[];
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
