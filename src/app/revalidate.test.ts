/**
 * Holds every route's segment `revalidate` literal to its constant in `congress/upstream/http.ts`. Next requires a
 * literal it can read without evaluating the module (see `01-app/02-guides/caching-without-cache-components.md` in the
 * `next` docs), so the duplication is unavoidable; this test keeps it from drifting, and checks the route list against
 * the route tree so a new route can't be missed.
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
 * Every route declaring its own `revalidate`, and which window. `concluded` routes declare the one-day window as a
 * ceiling; their fetches shorten it while their Congress is current.
 *
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
 * Finds every route file in `src/app` that exports a segment `revalidate`, read off disk so a forgotten route is found.
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
