/**
 * Covers getCurrentCongress's date-based computation: known Congress/year pairs, the January 3 transition
 * boundary (the one point in the cycle where the calendar year alone isn't enough), and the no-argument default.
 */
import { describe, expect, it } from "vitest";

import { getCurrentCongress } from "@/lib/congress/current-congress";

describe("getCurrentCongress", (): void => {
  it("matches known Congress/year pairs for dates well inside a term", (): void => {
    expect(getCurrentCongress(new Date("2019-06-01T00:00:00Z"))).toBe(116);
    expect(getCurrentCongress(new Date("2021-06-01T00:00:00Z"))).toBe(117);
    expect(getCurrentCongress(new Date("2023-06-01T00:00:00Z"))).toBe(118);
    expect(getCurrentCongress(new Date("2025-06-01T00:00:00Z"))).toBe(119);
    expect(getCurrentCongress(new Date("2026-07-23T00:00:00Z"))).toBe(119);
  });

  it("holds steady through the second (even) year of a Congress's term, including its first two days", (): void => {
    expect(getCurrentCongress(new Date("2026-01-02T23:59:59Z"))).toBe(119);
    expect(getCurrentCongress(new Date("2026-12-31T23:59:59Z"))).toBe(119);
  });

  it("keeps the outgoing Congress through January 1-2 of the next odd year, since the term runs through Jan 3", (): void => {
    expect(getCurrentCongress(new Date("2027-01-01T00:00:00Z"))).toBe(119);
    expect(getCurrentCongress(new Date("2027-01-02T23:59:59Z"))).toBe(119);
  });

  it("rolls over to the next Congress at noon on January 3 of an odd year, not at New Year's", (): void => {
    expect(getCurrentCongress(new Date("2027-01-03T00:00:00Z"))).toBe(120);
    expect(getCurrentCongress(new Date("2027-06-01T00:00:00Z"))).toBe(120);
  });

  it("defaults to the system clock when no reference date is given", (): void => {
    expect(getCurrentCongress()).toBe(getCurrentCongress(new Date()));
  });
});
