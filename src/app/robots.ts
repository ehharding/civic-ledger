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
 * Crawlers whose only use of this site is collecting AI training data, denied the whole site.
 *
 * **This list exists because of one crawler.** In November 2026 GPTBot was 43,000 of 44,000 requests in a six-hour
 * window — about 98% of all traffic — walking every bill page since the 93rd Congress, one cold render at a time. That
 * single crawler was on course to cross the Hobby plan's function-invocation and Active CPU limits on its own, which is
 * what paused this project once already, and a paused Hobby project cannot always be unpaused without paying.
 *
 * **Training crawlers only, never search or user-fetch agents.** A training crawler sends no readers back: what it
 * reads becomes model weights, not a link. Search and answer agents are the opposite — `OAI-SearchBot`, `ChatGPT-User`,
 * `PerplexityBot`, `Googlebot`, `Bingbot` are how a reader finds this site — so they are deliberately absent and keep
 * the `*` rules below. Each name here is a vendor's documented training-only token, distinct from that vendor's search
 * agent; `Google-Extended` and `Applebot-Extended` are pure opt-out tokens that fetch nothing themselves.
 *
 * Robots rules are advisory, and every crawler named here documents that it honors them. A crawler that matches a named
 * group follows only that group and ignores `*`, which is what makes `disallow: "/"` here total.
 *
 * **Short on purpose, and not the enforcement.** This file only binds crawlers polite enough to read it, so listing
 * every scraper ever seen buys little: the ones that ignore it are exactly the ones a longer list would add. What
 * actually stops them is the Vercel Firewall's AI Bots managed ruleset (AI Crawlers set to Deny), whose list Vercel
 * keeps current. This list is the well-documented, robots-honoring training crawlers, stated in the open. Add a name
 * when the dashboard's Bot Name breakdown shows it costing real requests, or when a vendor documents a new
 * training-only token. ai-robots-txt/ai.robots.txt on GitHub is a community-maintained catalogue to check a name
 * against, not to copy wholesale. @see docs/deployment.md, "Keeping Server Work Bounded".
 */
export const AI_TRAINING_CRAWLERS: readonly string[] = [
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "Google-Extended",
  "GPTBot",
  "meta-externalagent",
];

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
 * AI training crawlers are refused the whole site. @see AI_TRAINING_CRAWLERS.
 *
 * @returns The robots rules and a pointer to the generated sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl: string = getSiteUrl();

  return {
    rules: [
      { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/api/", `${QUERY_ROUTE_PREFIX}/`, ...queryRouteDisallows()] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
