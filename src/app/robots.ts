import type { MetadataRoute } from "next";

import { getCurrentCongress } from "@/lib/congress/current-congress";
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

/**
 * Keeps crawlers off bill pages from a concluded Congress while leaving the sitting Congress's open.
 *
 * Those pages are the site's long tail, about ten thousand per Congress back to the 93rd, and a crawler walking them
 * pays a cold render, an ISR write that is almost never read back, and up to eight Congress.gov requests per page. One
 * such walk through of the 100th Congress used up the API key's hourly quota, and every page on the site fell back to
 * preview data. A concluded Congress's bills stay reachable to readers, and its directory stays crawlable; only the
 * individual records are withheld from crawlers.
 *
 * Robots rules resolve by the longest matching path, so an allowed Congress's prefix outranks the shorter wildcard
 * rule. The next Congress is allowed too, because this file is built once per deploy, and a new Congress convenes every
 * other January whether or not anything deployed that day.
 *
 * @param currentCongress - The Congress now sitting. A parameter so tests can pin it.
 * @returns The allow and disallow entries for bill records.
 * @see docs/deployment.md, "Keeping Server Work Bounded"
 */
export function billRecordRules(currentCongress: number = getCurrentCongress()): {
  allow: string[];
  disallow: string[];
} {
  return {
    allow: [`/bills/${currentCongress}/`, `/bills/${currentCongress + 1}/`],
    disallow: ["/bills/*/"],
  };
}

/**
 * Reads no request data, so it's safe to include in a STATIC_EXPORT=true build — required explicitly because
 * `output: "export"` won't infer it.
 */
export const dynamic = "force-static";

/**
 * Crawlers whose only use of this site is AI training, denied the whole site. Training crawls are one cold render per
 * bill page and send no readers back, which threatens the Hobby plan's limits.
 *
 * Training-only tokens, never search or user-fetch agents (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`,
 * `Googlebot`, `Bingbot` keep the `*` rules). A crawler matching a named group ignores `*`, so `disallow: "/"` is
 * total.
 *
 * Short on purpose: robots.txt only binds polite crawlers; the Vercel Firewall's AI Bots ruleset is the enforcement.
 * Add a name when the Bot Name breakdown shows real cost or a vendor documents a new training-only token.
 *
 * @see docs/deployment.md, "Keeping Server Work Bounded"
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
 * - `/api/` is disallowed: those internal proxies return the pages' records as bare JSON, with none of their context.
 * - Every query-carrying variant of a route with a `/query` twin is disallowed, along with the twins. To a crawler a
 *   narrowed directory duplicates its canonical route but renders on demand, so walking every facet combination is pure
 *   server cost. The paths come from the rewrite table, so a route that gains a twin is covered automatically.
 * - AI training crawlers are refused the whole site, and every other crawler a concluded Congress's bill records.
 *
 * @returns The robots rules and a pointer to the generated sitemap.
 * @see src/lib/query-routes.ts
 * @see AI_TRAINING_CRAWLERS
 * @see billRecordRules
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl: string = getSiteUrl();
  const bills: { allow: string[]; disallow: string[] } = billRecordRules();

  return {
    rules: [
      { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" },
      {
        userAgent: "*",
        allow: ["/", ...bills.allow],
        disallow: ["/api/", `${QUERY_ROUTE_PREFIX}/`, ...queryRouteDisallows(), ...bills.disallow],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
