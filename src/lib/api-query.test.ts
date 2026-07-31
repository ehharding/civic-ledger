/**
 * Covers api-query.ts's parsing rules. These are the app's own untrusted-input boundary — everything here arrives from
 * the URL bar — so the cases that matter are the malformed ones, and the contract that every one of them resolves to a
 * usable value rather than an error the UI has no way to explain.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_BILL_OFFSET,
  MAX_QUERY_LENGTH,
  parseCongressQueryParam,
  parseOffsetParam,
  parseQueryParam,
} from "@/lib/api-query";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";

describe("parseOffsetParam", (): void => {
  it("reads a normal offset", (): void => {
    expect(parseOffsetParam("12")).toBe(12);
  });

  it("treats an absent param as the first page", (): void => {
    expect(parseOffsetParam(null)).toBe(0);
  });

  it("floors a negative offset to zero rather than sending it upstream", (): void => {
    expect(parseOffsetParam("-40")).toBe(0);
  });

  it("truncates a fractional offset", (): void => {
    expect(parseOffsetParam("12.9")).toBe(12);
  });

  it("falls back to the first page for non-numeric input", (): void => {
    expect(parseOffsetParam("not-a-number")).toBe(0);
    expect(parseOffsetParam("")).toBe(0);
  });

  it("falls back to the first page for a value that coerces to a number but is not finite", (): void => {
    // `Number("Infinity")` is `Infinity`, not `NaN`, so it survives coercion and then has to be caught on the way out —
    // `Math.min(ceiling, Infinity)` would otherwise be the ceiling, silently turning a nonsense param into a deep page.
    expect(parseOffsetParam("Infinity")).toBe(0);
    expect(parseOffsetParam("-Infinity")).toBe(0);
  });

  it("clamps an absurd offset to the ceiling", (): void => {
    expect(parseOffsetParam("999999999")).toBe(MAX_BILL_OFFSET);
    expect(parseOffsetParam("1e40")).toBe(MAX_BILL_OFFSET);
  });
});

describe("parseCongressQueryParam", (): void => {
  const current: number = 119;

  it("accepts a Congress in the supported range", (): void => {
    expect(parseCongressQueryParam("118", current)).toBe(118);
    expect(parseCongressQueryParam(String(EARLIEST_COVERED_CONGRESS), current)).toBe(EARLIEST_COVERED_CONGRESS);
  });

  it("falls back to the current Congress when the param is absent", (): void => {
    expect(parseCongressQueryParam(null, current)).toBe(current);
  });

  it("falls back for a Congress outside the supported range", (): void => {
    expect(parseCongressQueryParam("1", current)).toBe(current);
    expect(parseCongressQueryParam("400", current)).toBe(current);
  });

  it("falls back for input that isn't a Congress number at all", (): void => {
    expect(parseCongressQueryParam("nineteen", current)).toBe(current);
    expect(parseCongressQueryParam("118.5", current)).toBe(current);
  });
});

describe("parseQueryParam", (): void => {
  it("trims the query", (): void => {
    expect(parseQueryParam("  broadband  ")).toBe("broadband");
  });

  it("treats an absent param as an empty query", (): void => {
    expect(parseQueryParam(null)).toBe("");
  });

  it("caps an over-long query rather than passing it through", (): void => {
    expect(parseQueryParam("x".repeat(MAX_QUERY_LENGTH + 500))).toHaveLength(MAX_QUERY_LENGTH);
  });
});
