import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { FIXTURE_CONGRESS_BILLS, PAGE_ROUTES, type PageRoute } from "./routes";

/**
 * Compiles and primes every route the suite touches, once, before any spec runs. The suite runs against `pnpm dev`, so
 * without this, parallel specs race cold Turbopack compiles into navigation timeouts. With a `CONGRESS_API_KEY` set it
 * also warms the upstream cache. Sequential on purpose: concurrent compiles are what's being avoided.
 */

/** Every page the specs sweep, plus the fixture Congress's directory and the two API routes the specs call. */
const ROUTES: readonly string[] = [
  ...PAGE_ROUTES.map((route: PageRoute): string => route.path),
  FIXTURE_CONGRESS_BILLS,
  "/api/bills?offset=0",
  "/api/bills/search?q=broadband",
];

/** A member page's href in served HTML. The nav's bare `/members` carries no ID, so it never matches. */
const MEMBER_HREF: RegExp = /href="(\/members\/[A-Za-z0-9-]+)"/;

/** A directory to warm, and the pattern its first record link matches. */
type RecordRoute = {
  /** The directory's path. */
  directory: string;
  /** Captures the first record href in the directory's HTML. */
  href: RegExp;
};

/**
 * The three record routes, found by matching the first record href in each directory's served HTML. A directory with no
 * match is left unwarmed; the real specs report an empty grid.
 */
const RECORD_ROUTES: readonly RecordRoute[] = [
  { directory: "/bills", href: /href="(\/bills\/\d+\/[a-z]+\/\d+)"/ },
  { directory: "/members", href: MEMBER_HREF },
  { directory: "/committees", href: /href="(\/committees\/(?:house|senate|joint)\/[a-z0-9-]+)"/ },
];

/**
 * Fetches one path and drains its body — the routes stream, so the headers arrive long before the render finishes.
 *
 * @param request - Playwright's request context, already scoped to the dev server's `baseURL`.
 * @param path - The path to fetch.
 * @returns The full response body.
 */
async function warm(request: APIRequestContext, path: string): Promise<string> {
  const response: APIResponse = await request.get(path);

  // A non-OK status here is the dev server being broken rather than this app misbehaving, and saying so once, early,
  // beats every spec that follows timing out against it in parallel.
  expect(response.ok(), `warming ${path}`).toBe(true);

  return response.text();
}

test("every route is compiled and its upstream reads are cached", async ({ request }): Promise<void> => {
  // Generous, and spent once: a cold checkout with a live API key compiles and fetches slowly here so specs don't.
  test.setTimeout(180_000);

  for (const path of ROUTES) await warm(request, path);

  const records: string[] = [];
  for (const { directory, href } of RECORD_ROUTES) {
    const match: RegExpMatchArray | null = (await warm(request, directory)).match(href);
    if (match?.[1]) records.push(await warm(request, match[1]));
  }

  // One more hop, for the spec that follows the first bill's sponsor: member pages' upstream reads are per person, and
  // the sponsor is rarely the directory's first member. A bill page's first member link is its sponsor line.
  const sponsor: RegExpMatchArray | null = (records[0] ?? "").match(MEMBER_HREF);
  if (sponsor?.[1]) await warm(request, sponsor[1]);
});
