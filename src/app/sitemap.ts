import type { MetadataRoute } from "next";

import { type CongressHistoryEntry, listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { listStoredRecordPaths, SITEMAP_RECORD_LIMIT, type StoredRecordPaths } from "@/lib/ingest/stored";
import { lessonHref } from "@/lib/lesson-route";
import { type Lesson, lessons } from "@/lib/lessons";
import { getSiteUrl } from "@/lib/site";

/**
 * Regenerated hourly rather than pinned at build time.
 *
 * This file used to be `force-static`, which was right while every entry in it was computed from a constant. Now that
 * individual records are listed from the ingested copy, a build-time snapshot would advertise whatever had been
 * ingested at deploy time and never mention anything since. An hour is well inside the sync cadence and costs one
 * bounded local query per hour.
 *
 * A static export prerenders this once and ignores the interval, which is correct there: that build has no database, so
 * the record entries are empty and the file degrades to exactly the constant-derived list it was before.
 */
export const revalidate = 3600;

/**
 * Static top-level routes. Their content changes rarely, so they carry a low change frequency.
 *
 * `/members` and `/committees` belong here even though the data behind them is live: the *routes* are fixed and
 * reachable without an API key, which is all a crawler needs.
 *
 * @see docs/architecture.md, "Crawlability".
 */
const STATIC_ROUTES: readonly string[] = [
  "",
  "/bills",
  "/members",
  "/committees",
  "/learn",
  // Every learning module, read out of the registry rather than listed here. The list is computed with no I/O, so
  // including it costs the file none of its "cheap and reliable" property.
  ...lessons.map((lesson: Lesson): string => lessonHref(lesson.slug)),
  "/about",
];

/**
 * Generates `sitemap.xml`, referenced by `robots.ts`.
 *
 * Three sets of URLs, in ascending order of how much they cost to know:
 *
 * 1. **Static routes and learning modules** — constants, free.
 * 2. **One page per supported Congress** — computed by `listCongresses` from a fixed constitutional cadence, also free.
 * 3. **Individual bill, member, and committee records** — read from the ingested copy.
 *
 * The third set is new, and it is the consumer the "Crawlability" section of `docs/architecture.md` was holding it back
 * for. The original objection was never that those pages don't deserve listing; it was that enumerating them meant a
 * live Congress.gov request at build time, which would have made a file whose entire job is to be cheaply and reliably
 * generated depend on an API key and a healthy upstream. Reading records already on hand locally needs neither, so the
 * objection lapses with the condition that produced it — and where there is no database, `listStoredRecordPaths`
 * returns nothing and this file is exactly what it was before.
 *
 * @returns Every URL to advertise, each with a last-modified date and a change frequency reflecting how often that kind
 *   of page actually changes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl: string = getSiteUrl();
  const lastModified: Date = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route: string) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/bills" ? ("daily" as const) : ("monthly" as const),
    priority: route === "" ? 1 : 0.8,
  }));

  const congressEntries: MetadataRoute.Sitemap = listCongresses().map((entry: CongressHistoryEntry) => ({
    url: `${siteUrl}/bills/${entry.number}`,
    lastModified,
    // A concluded Congress's records are final; the current one gains bills every day it sits.
    changeFrequency: entry.isCurrent ? ("daily" as const) : ("yearly" as const),
    priority: entry.isCurrent ? 0.9 : 0.5,
  }));

  const stored: StoredRecordPaths = await listStoredRecordPaths(getCurrentCongress());

  // Said out loud rather than left to be inferred from a file that stops at a round number. A sitemap that silently
  // truncates reads exactly like one that covered everything.
  if (stored.omitted > 0) {
    console.warn(`[sitemap] ${stored.omitted} stored records omitted; the per-type cap is ${SITEMAP_RECORD_LIMIT}.`);
  }

  const recordEntries: MetadataRoute.Sitemap = stored.paths.map((path: string) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    // An individual record changes when the bill moves, which is episodic rather than scheduled — weekly is the honest
    // middle between the directory's daily churn and a concluded Congress's yearly stillness.
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...congressEntries, ...recordEntries];
}
