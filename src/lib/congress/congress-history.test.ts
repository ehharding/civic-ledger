/**
 * Covers congress-history's pure date/range math (getCongressYearRange), its validity boundary (isValidCongress),
 * route-param parsing (parseCongressParam — including inputs Number() would otherwise silently coerce), and the
 * descending list the Congress switcher renders from (listCongresses).
 */
import { describe, expect, it } from "vitest";

import {
  type CongressHistoryEntry,
  EARLIEST_COVERED_CONGRESS,
  getCongressYearRange,
  isValidCongress,
  listCongresses,
  parseCongressParam,
} from "@/lib/congress/congress-history";

describe("getCongressYearRange", (): void => {
  it("matches known Congress/year pairs", (): void => {
    expect(getCongressYearRange(1)).toEqual({ startYear: 1789, endYear: 1791 });
    expect(getCongressYearRange(93)).toEqual({ startYear: 1973, endYear: 1975 });
    expect(getCongressYearRange(119)).toEqual({ startYear: 2025, endYear: 2027 });
  });
});

describe("isValidCongress", (): void => {
  it("accepts the earliest covered Congress and the current one", (): void => {
    expect(isValidCongress(EARLIEST_COVERED_CONGRESS, 119)).toBe(true);
    expect(isValidCongress(119, 119)).toBe(true);
  });

  it("rejects anything earlier than the earliest covered Congress", (): void => {
    expect(isValidCongress(EARLIEST_COVERED_CONGRESS - 1, 119)).toBe(false);
  });

  it("rejects anything later than the current Congress", (): void => {
    expect(isValidCongress(120, 119)).toBe(false);
  });

  it("rejects non-integers", (): void => {
    expect(isValidCongress(118.5, 119)).toBe(false);
  });
});

describe("parseCongressParam", (): void => {
  it("parses a clean, in-range whole number", (): void => {
    expect(parseCongressParam("119", 119)).toBe(119);
    expect(parseCongressParam("93", 119)).toBe(93);
  });

  it("returns null for a Congress outside the supported range", (): void => {
    expect(parseCongressParam("50", 119)).toBeNull();
    expect(parseCongressParam("120", 119)).toBeNull();
  });

  it("returns null for non-numeric input", (): void => {
    expect(parseCongressParam("abc", 119)).toBeNull();
  });

  it("returns null for a decimal, rather than letting Number() truncate it", (): void => {
    expect(parseCongressParam("119.5", 119)).toBeNull();
  });

  it("returns null for a signed number, rather than letting Number() coerce it", (): void => {
    expect(parseCongressParam("-5", 119)).toBeNull();
    expect(parseCongressParam("+119", 119)).toBeNull();
  });

  it("returns null for empty input", (): void => {
    expect(parseCongressParam("", 119)).toBeNull();
  });
});

describe("listCongresses", (): void => {
  it("lists every supported Congress, most recent first", (): void => {
    const entries: CongressHistoryEntry[] = listCongresses(95);

    expect(entries).toHaveLength(95 - EARLIEST_COVERED_CONGRESS + 1);
    expect(entries[0]).toEqual({ number: 95, startYear: 1977, endYear: 1979, isCurrent: true });
    expect(entries.at(-1)).toEqual({
      number: EARLIEST_COVERED_CONGRESS,
      startYear: 1973,
      endYear: 1975,
      isCurrent: false,
    });
  });

  it("flags exactly one entry as current", (): void => {
    const entries: CongressHistoryEntry[] = listCongresses(100);
    expect(entries.filter((entry: CongressHistoryEntry): boolean => entry.isCurrent)).toHaveLength(1);
  });
});
