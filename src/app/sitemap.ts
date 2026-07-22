import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build (see robots.ts for the same reasoning) —
// required explicitly because `output: "export"` won't infer it.
export const dynamic = "force-static";

/** Static top-level routes. Live bill records aren't enumerated here: there are too many, and each is already
 * discoverable through /bills, so listing them individually wouldn't help crawlers or be worth keeping in sync. */
const routes: string[] = ["", "/bills", "/learn", "/about"];

/** Generates sitemap.xml, referenced by robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl: string = getSiteUrl();

  return routes.map((route: string): { url: string; lastModified: Date } => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
  }));
}
