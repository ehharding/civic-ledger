import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * Compiles and primes every route the suite touches, once, before any spec runs.
 *
 * This exists because of the deliberate choice `playwright.config.ts` makes just below it: the suite runs against
 * `pnpm dev` rather than a production build, so Turbopack compiles each route the first time something asks for it.
 * That cost lands on whichever test happens to touch a route first, and with `fullyParallel` it lands on four of them
 * at once, each waiting on a different cold compile while contending for the same machine. The config's own comment
 * already names the failure that produces — "a cold compile that outran a navigation timeout" — and treats it as
 * something a CI retry disproves after the fact.
 *
 * Locally there are no retries, by an argument worth keeping: "a failure is a failure — retrying it just delays the
 * answer while someone watches." The problem is that a cold-start timeout is *not* a failure, so the first
 * `pnpm test:e2e` on a fresh checkout could report one anyway — a red result that means nothing, on a suite whose whole
 * value is that a red result means something. Warming beforehand fixes that at the cause rather than by widening a
 * timeout until the flake stops fitting inside it, or by turning on retries that would also hide real intermittency.
 *
 * It primes two things, not one. The compile is the obvious half; the other is this app's own five-minute upstream
 * cache (@see REVALIDATE_SECONDS). A contributor with a `CONGRESS_API_KEY` set has every directory doing real
 * Congress.gov round trips, and warming means the specs read a warm cache instead of racing the network. CI has no key
 * at all and renders fixtures, so there it is purely the compile — which is also why this flake was invisible in CI
 * and reproducible only on a developer's machine.
 *
 * Sequential on purpose. Compiling four heavy routes concurrently is the condition being avoided, not the fix.
 */

/** Every route with a shape of its own, in the order a reader meets them. Kept to route *shapes*, not to URLs. */
const ROUTES: readonly string[] = [
  "/",
  "/bills",
  "/members",
  "/committees",
  "/learn",
  "/learn/how-a-bill-becomes-law",
  "/about",
  "/api/bills?offset=0",
  "/api/bills/search?q=broadband",
];

/**
 * The three record routes, which have no fixed URL: each is reached by following the first link off its directory.
 *
 * The pattern is the same one the specs click, expressed as the href it produces rather than as a CSS selector — this
 * reads the served HTML rather than a rendered DOM. A directory that yields no match is left unwarmed rather than
 * failed here: an empty grid is a finding the real specs exist to report, and reporting it twice, from a file whose job
 * is to warm things, would only make it harder to read.
 */
const RECORD_ROUTES: readonly { directory: string; href: RegExp }[] = [
  { directory: "/bills", href: /href="(\/bills\/\d+\/[a-z]+\/\d+)"/ },
  { directory: "/members", href: /href="(\/members\/[A-Za-z0-9-]+)"/ },
  { directory: "/committees", href: /href="(\/committees\/(?:house|senate|joint)\/[a-z0-9-]+)"/ },
];

/**
 * Fetches one path and drains its body.
 *
 * Draining is the load-bearing part. These routes stream — every one of them has a `loading.tsx` — so the response
 * headers arrive as soon as the shell does, long before the data the page is actually waiting on. Reading the body to
 * completion is what makes this a warm-up of the whole render rather than of its first few bytes.
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
  // Generous, and only ever spent once: this is the compile the rest of the suite is no longer paying for, and on a
  // cold checkout with a live API key it is genuinely slow. Every spec after it keeps the default timeout.
  test.setTimeout(180_000);

  for (const path of ROUTES) await warm(request, path);

  for (const { directory, href } of RECORD_ROUTES) {
    const match: RegExpMatchArray | null = (await warm(request, directory)).match(href);
    if (match?.[1]) await warm(request, match[1]);
  }
});
