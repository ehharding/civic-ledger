/** Covers formatOrdinal's suffix rules, including the 11th/12th/13th exception to the usual st/nd/rd pattern. */
import { describe, expect, it } from "vitest";

import { formatOrdinal } from "@/lib/format";

describe("formatOrdinal", (): void => {
  it("uses st/nd/rd for numbers ending in 1, 2, or 3", (): void => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(2)).toBe("2nd");
    expect(formatOrdinal(3)).toBe("3rd");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(122)).toBe("122nd");
    expect(formatOrdinal(123)).toBe("123rd");
  });

  it("falls back to th for the 11th/12th/13th exception, even though they end in 1, 2, or 3", (): void => {
    expect(formatOrdinal(11)).toBe("11th");
    expect(formatOrdinal(12)).toBe("12th");
    expect(formatOrdinal(13)).toBe("13th");
    expect(formatOrdinal(111)).toBe("111th");
    expect(formatOrdinal(112)).toBe("112th");
    expect(formatOrdinal(113)).toBe("113th");
  });

  it("uses th for every other number, including the current Congress", (): void => {
    expect(formatOrdinal(4)).toBe("4th");
    expect(formatOrdinal(100)).toBe("100th");
    expect(formatOrdinal(119)).toBe("119th");
    expect(formatOrdinal(120)).toBe("120th");
  });
});
