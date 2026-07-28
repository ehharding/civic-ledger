import type { MetadataRoute } from "next";

import { type CongressHistoryEntry, listCongresses } from "@/lib/congress/congress-history";
import { getSiteUrl } from "@/lib/site";

// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build (see robots.ts for the same reasoning) —
// required explicitly because `output: "export"` won't infer it.
export const dynamic = "force-static";

/**
 * Static top-level routes. Their content changes rarely, so they carry a low change frequency.
 *
 * `/members` belongs here even though the roster behind it is live data: the *route* is fixed and reachable without an
 * API key, which is all a crawler needs. Individual member pages still stay out — see "Member Routes Stay Out of the
 * Sitemap" in `docs/decisions.md` — and the directory is now the page that leads a crawler to all of them.
 */
const STATIC_ROUTES: readonly string[] = [
  "",
  "/bills",
  "/members",
  "/learn",
  "/learn/how-a-bill-becomes-law",
  "/about",
];

/**
 * Generates `sitemap.xml`, referenced by `robots.ts`.
 *
 * Includes the static top-level routes and one entry per Congress the directory supports browsing — those are real,
 * stable, individually useful pages (`/bills/118` answers "what did the last Congress do?"), and there are a few dozen
 * of them rather than an unbounded set, so listing them is both cheap and genuinely helpful to a crawler that would
 * otherwise only ever see them behind a `<select>` control it can't operate.
 *
 * Individual bill records are deliberately *not* enumerated: there are hundreds of thousands, they'd need constant
 * regeneration to stay accurate, and each is already reachable from its Congress's directory page.
 *
 * @returns Every URL to advertise, each with a last-modified date and a change frequency reflecting how often that kind
 *   of page actually changes.
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
    url: `${siteUrl}/bills/${entry.number}`,
    lastModified,
    // A concluded Congress's records are final; the current one gains bills every day it sits.
    changeFrequency: entry.isCurrent ? ("daily" as const) : ("yearly" as const),
    priority: entry.isCurrent ? 0.9 : 0.5,
  }));

  return [...staticEntries, ...congressEntries];
}
