import type { MetadataRoute } from "next";

import { QUERY_ROUTE_PREFIX, QUERY_ROUTES, type QueryRoute } from "@/lib/query-routes";
import { getSiteUrl } from "@/lib/site";

/**
 * The robots.txt spelling of "this route, with a query string".
 *
 * Robots rules match a URL by prefix, path and query together, with `*` as the one wildcard Google and Bing honor — so
 * `/bills?` covers every `/bills?…` and nothing under `/bills/`, and a dynamic segment becomes `*`. Keyed on the bare
 * `?` rather than on each param because a rule per param could only list the params the twin reads, while any query is
 * a duplicate as far as a crawler is concerned.
 *
 * @returns e.g., `["/bills?", "/bills/*?", "/members?", …]`.
 */
function queryRouteDisallows(): string[] {
  return QUERY_ROUTES.map((route: QueryRoute): string => `${route.source.replace(/:\w+/g, "*")}?`);
}

// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build — required explicitly because
// `output: "export"` won't infer it.
export const dynamic = "force-static";

/**
 * Generates `robots.txt`.
 *
 * `/api/` is disallowed because those routes are this app's own internal proxies — they return the same records the
 * HTML pages do, with none of the context that makes them meaningful, so indexing them would only split crawl budget
 * and surface bare JSON in search results.
 *
 * Every query-carrying variant of a route with a `/query` twin is disallowed too, along with the twins themselves. A
 * narrowed directory is a real page for a reader holding its link, but to a crawler it is a duplicate — its canonical
 * tag already names the plain route — and, unlike that route, it is rendered on demand. A crawler walking every
 * combination of facets is exactly the traffic that is pure server cost and no search value. The paths are built from
 * the rewrite table, so a route that gains a twin is covered here without a second list. @see src/lib/query-routes.ts.
 *
 * @returns The robots rules and a pointer to the generated sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl: string = getSiteUrl();

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", `${QUERY_ROUTE_PREFIX}/`, ...queryRouteDisallows()] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
