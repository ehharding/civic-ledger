/**
 * The enforcement point for the one constant in this app that cannot be imported where it is used.
 *
 * `REVALIDATE_SECONDS` in `congress/upstream/http.ts` is the five-minute window every Congress.gov request is cached
 * for, and `CONCLUDED_CONGRESS_REVALIDATE_SECONDS` beside it is the one-day window for a Congress that has ended. Four
 * routes restate the first as a bare `300` and two the second as a bare `86_400`, because Next requires the
 * route-segment `revalidate` export to be a literal it can read out of the module without evaluating it. Its own guide
 * gives `revalidate = 600` as valid and `revalidate = 60 * 10` as not — arithmetic is already too much — so
 * `export const revalidate = REVALIDATE_SECONDS` is not a spelling the framework undertakes to honor.
 * @see `01-app/02-guides/caching-without-cache-components.md` in the `next` package's own docs.
 *
 * So the duplication is the framework's requirement and cannot be refactored away. What can be removed is its ability
 * to drift: this reads each route's own export and asserts it against its constant, which turns "separate literals that
 * have to agree" into "separate literals that a test proves agree". Changing a window in `http.ts` fails here until
 * every route has been changed with it, rather than leaving some routes quietly caching at the old value.
 *
 * Every route declaring `revalidate` is listed. A new one that declares its own is not automatically covered — which is
 * why the last case checks the list itself against the route tree rather than trusting it to have been updated.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { revalidate as billRevalidate } from "@/app/bills/[congress]/[type]/[number]/page";
import { revalidate as congressBillsRevalidate } from "@/app/bills/[congress]/page";
import { revalidate as billsRevalidate } from "@/app/bills/page";
import { revalidate as committeesRevalidate } from "@/app/committees/page";
import { revalidate as membersRevalidate } from "@/app/members/page";
import { revalidate as homeRevalidate } from "@/app/page";
import { CONCLUDED_CONGRESS_REVALIDATE_SECONDS, REVALIDATE_SECONDS } from "@/lib/congress/upstream/http";

/**
 * Every route that declares its own segment cache window, by the path a reader would look for it under, and which of
 * the two windows it declares.
 *
 * `shared` routes declare the five-minute window outright. `concluded` routes are scoped to one Congress, and declare
 * the one-day concluded window as a ceiling: their fetches carry the five-minute window whenever that Congress is the
 * current one, and a route is regenerated on the shortest window of its segment and its fetches.
 * @see revalidateSecondsForCongress
 */
const ROUTES: readonly { path: string; revalidate: number; window: "shared" | "concluded" }[] = [
  { path: "src/app/page.tsx", revalidate: homeRevalidate, window: "shared" },
  { path: "src/app/bills/page.tsx", revalidate: billsRevalidate, window: "shared" },
  { path: "src/app/bills/[congress]/page.tsx", revalidate: congressBillsRevalidate, window: "concluded" },
  { path: "src/app/bills/[congress]/[type]/[number]/page.tsx", revalidate: billRevalidate, window: "concluded" },
  { path: "src/app/members/page.tsx", revalidate: membersRevalidate, window: "shared" },
  { path: "src/app/committees/page.tsx", revalidate: committeesRevalidate, window: "shared" },
];

/** The constant each kind of window is held to. */
const WINDOW_SECONDS: Record<"shared" | "concluded", number> = {
  shared: REVALIDATE_SECONDS,
  concluded: CONCLUDED_CONGRESS_REVALIDATE_SECONDS,
};

/**
 * Finds every route file in `src/app` that exports a segment `revalidate`.
 *
 * Read off disk rather than derived from imports, which is the point: an import list can only name routes someone
 * remembered to add to it, and the failure this guards against is precisely the one nobody remembered.
 *
 * @param directory - Where to start. Defaults to the app directory.
 * @returns Repo-relative paths, in a stable order.
 */
function routesDeclaringRevalidate(directory: string = "src/app"): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath: string = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...routesDeclaringRevalidate(entryPath));
      continue;
    }

    if (!/^(?:page|route|layout)\.tsx?$/.test(entry.name)) continue;
    if (/export const revalidate\b/.test(readFileSync(entryPath, "utf8"))) found.push(entryPath);
  }

  return found.sort();
}

describe("the route-segment cache window", (): void => {
  for (const route of ROUTES) {
    it(`is the ${route.window} window on ${route.path}`, (): void => {
      expect(route.revalidate).toBe(WINDOW_SECONDS[route.window]);
    });
  }

  it("covers every route that declares one, so a new route cannot opt itself out unnoticed", (): void => {
    expect(routesDeclaringRevalidate()).toEqual(ROUTES.map((route: { path: string }): string => route.path).sort());
  });
});
