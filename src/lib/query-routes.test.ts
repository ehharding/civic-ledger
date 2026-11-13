/**
 * Covers the rewrite table that keeps the directories static.
 *
 * The one failure worth guarding here is silent: a param added to a parser but not to `QUERY_ROUTES` still compiles,
 * still passes every route test (those call the twin directly), and in production serves that param's links the static,
 * unfiltered page. So the keys are held to each parser's own constant, and every source is held to a twin that exists
 * on disk.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BILL_DIRECTORY_PARAMS } from "@/lib/congress/bills/search";
import { COMMITTEE_DIRECTORY_PARAMS } from "@/lib/congress/committees/filter";
import { COMMITTEE_RECORDS_PARAMS } from "@/lib/congress/committees/records";
import { MEMBER_DIRECTORY_PARAMS } from "@/lib/congress/members/filter";
import { QUERY_ROUTE_PREFIX, QUERY_ROUTES, type QueryRoute, queryRewrites } from "@/lib/query-routes";

/** Every route's parser constant, by rewrite source. */
const PARSER_PARAMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "/bills": BILL_DIRECTORY_PARAMS,
  "/bills/:congress": BILL_DIRECTORY_PARAMS,
  "/members": MEMBER_DIRECTORY_PARAMS,
  "/committees": COMMITTEE_DIRECTORY_PARAMS,
  "/committees/:chamber/:systemCode": COMMITTEE_RECORDS_PARAMS,
};

/**
 * Maps a rewrite source onto the app directory, the way Next maps a route onto one.
 *
 * @param source - e.g. `"/bills/:congress"`.
 * @returns e.g. `"src/app/bills/[congress]"`.
 */
function appDirectory(source: string): string {
  return path.join("src/app", source.replace(/:(\w+)/g, "[$1]"));
}

describe("QUERY_ROUTES", (): void => {
  it("covers exactly the routes whose parsers read a query", (): void => {
    expect(QUERY_ROUTES.map((route: QueryRoute): string => route.source).sort()).toEqual(
      Object.keys(PARSER_PARAMS).sort(),
    );
  });

  it.each(QUERY_ROUTES)("rewrites $source for every key its parser reads, and no others", (route: QueryRoute): void => {
    expect([...route.keys].sort()).toEqual(Object.values(PARSER_PARAMS[route.source] ?? {}).sort());
  });

  it.each(QUERY_ROUTES)(
    "sends $source to a twin that exists, beside a route that exists",
    (route: QueryRoute): void => {
      expect(existsSync(path.join(appDirectory(route.source), "page.tsx"))).toBe(true);
      expect(existsSync(path.join(appDirectory(`${QUERY_ROUTE_PREFIX}${route.source}`), "page.tsx"))).toBe(true);
    },
  );
});

describe("queryRewrites", (): void => {
  it("emits one rule per key, since a rule's `has` conditions must all match", (): void => {
    expect(queryRewrites()).toContainEqual({
      source: "/members",
      has: [{ type: "query", key: "state" }],
      destination: "/query/members",
    });
    expect(queryRewrites()).toHaveLength(
      QUERY_ROUTES.reduce((total: number, route: QueryRoute): number => total + route.keys.length, 0),
    );
  });

  it("carries a dynamic segment through to the twin", (): void => {
    expect(queryRewrites()).toContainEqual({
      source: "/committees/:chamber/:systemCode",
      has: [{ type: "query", key: "records" }],
      destination: "/query/committees/:chamber/:systemCode",
    });
  });
});
