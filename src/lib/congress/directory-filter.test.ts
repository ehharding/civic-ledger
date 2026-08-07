/**
 * Covers the vocabulary all three directories narrow themselves with.
 *
 * Each directory's own module tests its own parsers, and those tests still stand — what is pinned down here is the
 * shared rule underneath them, so a change to it is caught once by name rather than three times by symptom. The
 * totality property in particular is the one that a shared link depends on: a hand-edited, truncated, or year-old URL
 * has to open a usable page rather than an error, and that is a promise this file makes on behalf of every param in the
 * app.
 */
import { describe, expect, it } from "vitest";

import {
  ANY_FACET,
  buildFacetOptions,
  countFacetValues,
  MAX_DIRECTORY_QUERY_LENGTH,
  parseEnumParam,
  parseQueryFilter,
  sortWithTiebreak,
  toQueryString,
} from "@/lib/congress/directory-filter";

describe("parseQueryFilter", (): void => {
  it("reads an absent param as an empty query, which every matcher treats as matching everything", (): void => {
    expect(parseQueryFilter(null)).toBe("");
    expect(parseQueryFilter(undefined)).toBe("");
  });

  it("trims surrounding whitespace, so a URL-encoded space doesn't become part of the search", (): void => {
    expect(parseQueryFilter("  broadband  ")).toBe("broadband");
  });

  it("caps the query rather than carrying an unbounded string into the page payload", (): void => {
    expect(parseQueryFilter("a".repeat(MAX_DIRECTORY_QUERY_LENGTH + 500))).toHaveLength(MAX_DIRECTORY_QUERY_LENGTH);
  });
});

describe("parseEnumParam", (): void => {
  const chambers = ["house", "senate"] as const;

  it("resolves a value the union names", (): void => {
    expect(parseEnumParam("senate", chambers, ANY_FACET)).toBe("senate");
  });

  it("matches case-insensitively after trimming, so a hand-typed link still resolves", (): void => {
    expect(parseEnumParam("  Senate ", chambers, ANY_FACET)).toBe("senate");
  });

  it("falls back rather than failing for anything unrecognized — the totality every deep link relies on", (): void => {
    expect(parseEnumParam("congress", chambers, ANY_FACET)).toBe(ANY_FACET);
    expect(parseEnumParam("", chambers, ANY_FACET)).toBe(ANY_FACET);
    expect(parseEnumParam(null, chambers, ANY_FACET)).toBe(ANY_FACET);
    expect(parseEnumParam(undefined, chambers, ANY_FACET)).toBe(ANY_FACET);
  });

  it("takes any fallback, since a sort param degrades to an order rather than to the wildcard", (): void => {
    expect(parseEnumParam("nonsense", ["name", "state"] as const, "name")).toBe("name");
  });
});

describe("toQueryString", (): void => {
  it("leaves an unnarrowed directory with a clean URL rather than one carrying params that say nothing", (): void => {
    expect(toQueryString(new URLSearchParams())).toBe("");
  });

  it("prefixes the leading question mark exactly once", (): void => {
    expect(toQueryString(new URLSearchParams({ q: "broadband" }))).toBe("?q=broadband");
  });

  it("preserves the order the caller set values in, so one view always serializes one way", (): void => {
    const params: URLSearchParams = new URLSearchParams();
    params.set("q", "ohio");
    params.set("chamber", "senate");

    expect(toQueryString(params)).toBe("?q=ohio&chamber=senate");
  });
});

describe("countFacetValues", (): void => {
  const roster = [{ party: "d" }, { party: "r" }, { party: "d" }] as const;

  it("tallies each value, so a facet can name how many records sit behind a choice", (): void => {
    const counts: Map<string, number> = countFacetValues(roster, (entry: { party: string }): string => entry.party);

    expect([...counts.entries()]).toEqual([
      ["d", 2],
      ["r", 1],
    ]);
  });

  it("counts a record carrying no value toward nothing rather than toward a blank option", (): void => {
    const counts: Map<string, number> = countFacetValues(
      [{ state: "Ohio" }, { state: "" }, { state: "Ohio" }],
      (entry: { state: string }): string | undefined => (entry.state.length > 0 ? entry.state : undefined),
    );

    expect([...counts.entries()]).toEqual([["Ohio", 2]]);
  });

  it("returns nothing for an empty list, rather than an option nobody can pick", (): void => {
    expect(countFacetValues([], (value: string): string => value).size).toBe(0);
  });
});

describe("buildFacetOptions", (): void => {
  type Row = { type: "standing" | "select" | "joint" };
  const rows: Row[] = [{ type: "select" }, { type: "standing" }, { type: "select" }];
  const order = ["standing", "select", "joint"] as const;
  const label = (value: Row["type"]): string => value.toUpperCase();

  it("reads in the model's declared order rather than the data's or the alphabet's", (): void => {
    // "select" outnumbers "standing" and sorts after it; neither fact moves it ahead of the declared order.
    expect(buildFacetOptions(rows, (row: Row): Row["type"] => row.type, order, label)).toEqual([
      { value: "standing", label: "STANDING", count: 1 },
      { value: "select", label: "SELECT", count: 2 },
    ]);
  });

  it("omits a value nobody holds, so a control can never offer a choice that returns an empty grid", (): void => {
    const options = buildFacetOptions(rows, (row: Row): Row["type"] => row.type, order, label);

    expect(options.map((option): string => option.value)).not.toContain("joint");
  });

  it("offers nothing at all for an empty list", (): void => {
    expect(buildFacetOptions([], (row: Row): Row["type"] => row.type, order, label)).toEqual([]);
  });
});

describe("sortWithTiebreak", (): void => {
  type Row = { group: number; name: string };
  const byGroup = (a: Row, b: Row): number => a.group - b.group;
  const byName = (a: Row, b: Row): number => a.name.localeCompare(b.name);

  it("orders by the chosen comparator first", (): void => {
    const rows: Row[] = [
      { group: 2, name: "a" },
      { group: 1, name: "b" },
    ];

    expect(sortWithTiebreak(rows, byGroup, byName).map((row: Row): string => row.name)).toEqual(["b", "a"]);
  });

  it("breaks a tie rather than leaving a group in whatever order it arrived in", (): void => {
    const rows: Row[] = [
      { group: 1, name: "c" },
      { group: 1, name: "a" },
      { group: 1, name: "b" },
    ];

    expect(sortWithTiebreak(rows, byGroup, byName).map((row: Row): string => row.name)).toEqual(["a", "b", "c"]);
  });

  it("leaves the input untouched, since a directory re-sorts the same list on every keystroke", (): void => {
    const rows: Row[] = [
      { group: 2, name: "a" },
      { group: 1, name: "b" },
    ];
    const sorted: Row[] = sortWithTiebreak(rows, byGroup, byName);

    expect(rows[0]?.name).toBe("a");
    expect(sorted).not.toBe(rows);
  });
});
