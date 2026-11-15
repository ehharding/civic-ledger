import type { MetadataRoute } from "next";

import { type CongressHistoryEntry, listCongresses } from "@/lib/congress/congress-history";
import { type Lesson, lessons } from "@/lib/lessons";
import { congressBillsHref, lessonHref } from "@/lib/routes";
import { getSiteUrl } from "@/lib/site";

// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build (see robots.ts for the same reasoning) —
// required explicitly because `output: "export"` won't infer it.
export const dynamic = "force-static";

/**
 * Static top-level routes. Individual records stay out, since listing them would need a live API call at build time;
 * each directory leads a crawler to them. @see docs/architecture.md, "Crawlability"
 */
const STATIC_ROUTES: readonly string[] = [
  "",
  "/bills",
  "/members",
  "/committees",
  "/learn",
  // Every learning module, read out of the registry rather than listed here. These are the one kind of individual
  // record page this file *does* enumerate, and the reason is the one it withholds from bills and members: the list is
  // computed with no I/O, so including it costs the file none of its "cheap and reliable" property.
  ...lessons.map((lesson: Lesson): string => lessonHref(lesson.slug)),
  "/about",
];

/**
 * Generates `sitemap.xml`: the static routes plus one directory per supported Congress, which a crawler would otherwise
 * only find behind a `<select>`.
 *
 * @returns Every URL to advertise, with a last-modified date and change frequency.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl: string = getSiteUrl();
  const lastModified: Date = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route: string) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/bills" ? ("daily" as const) : ("monthly" as const),
    priority: route === "" ? 1 : 0.8,
  }));

  const congressEntries: MetadataRoute.Sitemap = listCongresses().map((entry: CongressHistoryEntry) => ({
    url: `${siteUrl}${congressBillsHref(entry.number)}`,
    lastModified,
    // A concluded Congress's records are final; the current one gains bills every day it sits.
    changeFrequency: entry.isCurrent ? ("daily" as const) : ("yearly" as const),
    priority: entry.isCurrent ? 0.9 : 0.5,
  }));

  return [...staticEntries, ...congressEntries];
}
