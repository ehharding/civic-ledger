import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build — required explicitly because
// `output: "export"` won't infer it.
export const dynamic = "force-static";

/** Generates robots.txt, pointing crawlers at the generated sitemap and excluding API routes. */
export default function robots(): MetadataRoute.Robots {
  const siteUrl: string = getSiteUrl();

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
