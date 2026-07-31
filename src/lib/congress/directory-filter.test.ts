/**
 * Covers the vocabulary all three directories narrow themselves with.
 *
 * Each directory's own module tests its own parsers, and those tests still stand — what is pinned down here is the
 * shared rule underneath them, so a change to it is caught once by name rather than three times by symptom. The
 * totality property in particular is the one that a shared link depends on: a hand-edited, truncated, or year-old URL
 * has to open a usable page rather than an error, and that is a promise this file makes on behalf of every param in
 * the app.
 */
import { describe, expect, it } from "vitest";

import {
  ANY_FACET,
  MAX_DIRECTORY_QUERY_LENGTH,
  parseEnumParam,
  parseQueryFilter,
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
