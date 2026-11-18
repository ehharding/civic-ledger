import type { PlaywrightTestArgs, PlaywrightTestOptions } from "@playwright/test";

/** The per-test fixtures a spec destructures (`page`, `request`, …). */
export type TestFixtures = PlaywrightTestArgs & PlaywrightTestOptions;

/** One page route the suite sweeps. */
export type PageRoute = {
  /** The URL a reader meets it by. */
  path: string;
  /** How a test title names it. */
  name: string;
};

/**
 * Every page route with a shape of its own, at the URLs a reader actually meets them by — shared by the specs that
 * sweep each one and by the warmup that compiles them, so none of the three can quietly cover different pages.
 *
 * The three record pages are absent because they have no fixed URL; each spec reaches them by following the first link
 * off their directory.
 */
export const PAGE_ROUTES: readonly PageRoute[] = [
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

/** The three record pages, which the suite reaches by following the first link off their directory. */
export type RecordKind = "bill" | "member" | "committee";

/**
 * Each record page's path shape, as regex source: the one spelling {@link RECORD_URL} and {@link RECORD_HREF} are both
 * built from, so a spec's URL assertion and the warmup's link match cannot drift apart. Mirrors the builders in
 * `src/lib/routes.ts`.
 */
const RECORD_PATHS: Readonly<Record<RecordKind, string>> = {
  bill: String.raw`/bills/\d+/[a-z]+/\d+`,
  member: "/members/[A-Za-z0-9-]+",
  committee: "/committees/(?:house|senate|joint)/[a-z0-9-]+",
};

/**
 * Builds one pattern per record kind from {@link RECORD_PATHS}.
 *
 * @param pattern - Wraps a path's regex source into the full pattern.
 * @returns The three patterns, keyed by record kind.
 */
function recordPatterns(pattern: (path: string) => string): Readonly<Record<RecordKind, RegExp>> {
  return {
    bill: new RegExp(pattern(RECORD_PATHS.bill)),
    member: new RegExp(pattern(RECORD_PATHS.member)),
    committee: new RegExp(pattern(RECORD_PATHS.committee)),
  };
}

/** Matches a page URL that has landed on a record, for `toHaveURL`. Anchored at the end, so a query string fails it. */
export const RECORD_URL: Readonly<Record<RecordKind, RegExp>> = recordPatterns((path: string): string => `${path}$`);

/**
 * Captures the first link to a record in served HTML. The nav's bare `/members` and friends carry no ID, so they never
 * match.
 */
export const RECORD_HREF: Readonly<Record<RecordKind, RegExp>> = recordPatterns(
  (path: string): string => `href="(${path})"`,
);
