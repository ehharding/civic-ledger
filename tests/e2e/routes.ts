import type { PlaywrightTestArgs, PlaywrightTestOptions } from "@playwright/test";

/** The per-test fixtures a spec destructures (`page`, `request`, …). */
export type TestFixtures = PlaywrightTestArgs & PlaywrightTestOptions;

/**
 * Every page route with a shape of its own, at the URLs a reader actually meets them by — shared by the specs that
 * sweep each one, so the accessibility sweep and the layout checks cannot quietly come to cover different pages.
 *
 * The three record pages are absent because they have no fixed URL; each spec reaches them by following the first link
 * off their directory.
 */
export const PAGE_ROUTES: readonly { path: string; name: string }[] = [
  { path: "/", name: "home" },
  { path: "/bills", name: "bill directory" },
  { path: "/members", name: "member directory" },
  { path: "/committees", name: "committee directory" },
  { path: "/learn", name: "learn hub" },
  { path: "/learn/how-a-bill-becomes-law", name: "lesson" },
  { path: "/about", name: "methodology" },
  // A narrowed directory that matched nothing: a different render of the same route, and the one carrying the empty
  // state's own clear action. See DirectoryEmptyState.
  { path: "/members?q=zzznomatch", name: "member directory, empty" },
];

/**
 * A bill directory that lists preview fixtures on any date. CI runs without an API key, and `/bills` shows only the
 * Congress currently seated — which stops matching the fixtures' Congress once a new one convenes.
 */
export const FIXTURE_CONGRESS_BILLS: string = "/bills/119";
