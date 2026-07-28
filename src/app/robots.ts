import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

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
 * @returns The robots rules and a pointer to the generated sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl: string = getSiteUrl();

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
