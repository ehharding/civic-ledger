/**
 * The enforcement point for the one constant in this app that cannot be imported where it is used.
 *
 * `REVALIDATE_SECONDS` in `congress/upstream/http.ts` is the five-minute window every Congress.gov request is cached
 * for, and the README's Data Policy, `docs/architecture.md`, and each of these routes' own comments all describe the
 * app as having *one* such window. Five routes then restate it as a bare `300`, because Next requires the route-segment
 * `revalidate` export to be a literal it can read out of the module without evaluating it. Its own guide gives
 * `revalidate = 600` as valid and `revalidate = 60 * 10` as not — arithmetic is already too much — so
 * `export const revalidate = REVALIDATE_SECONDS` is not a spelling the framework undertakes to honor. @see
 * `01-app/02-guides/caching-without-cache-components.md` in the `next` package's own docs.
 *
 * So the duplication is the framework's requirement and cannot be refactored away. What can be removed is its ability
 * to drift: this reads each route's own export and asserts it against the constant, which turns "five separate 300s
 * that have to agree" into "five separate 300s that a test proves agree". Changing the window in `http.ts` fails here
 * until every route has been changed with it, rather than leaving five routes quietly caching at the old value.
 *
 * Every route declaring `revalidate` is listed. A new one that declares its own is not automatically covered — which is
 * why the last case checks the list itself against the route tree rather than trusting it to have been updated.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { revalidate as congressBillsRevalidate } from "@/app/bills/[congress]/page";
import { revalidate as billsRevalidate } from "@/app/bills/page";
import { revalidate as committeesRevalidate } from "@/app/committees/page";
import { revalidate as membersRevalidate } from "@/app/members/page";
import { revalidate as homeRevalidate } from "@/app/page";
import { REVALIDATE_SECONDS } from "@/lib/congress/upstream/http";

/** Every route that declares its own segment cache window, by the path a reader would look for it under. */
const ROUTES: readonly { path: string; revalidate: number }[] = [
  { path: "src/app/page.tsx", revalidate: homeRevalidate },
  { path: "src/app/bills/page.tsx", revalidate: billsRevalidate },
  { path: "src/app/bills/[congress]/page.tsx", revalidate: congressBillsRevalidate },
  { path: "src/app/members/page.tsx", revalidate: membersRevalidate },
  { path: "src/app/committees/page.tsx", revalidate: committeesRevalidate },
];

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
    it(`is the shared five-minute window on ${route.path}`, (): void => {
      expect(route.revalidate).toBe(REVALIDATE_SECONDS);
    });
  }

  it("covers every route that declares one, so a new route cannot opt itself out unnoticed", (): void => {
    expect(routesDeclaringRevalidate()).toEqual(ROUTES.map((route: { path: string }): string => route.path).sort());
  });
});
