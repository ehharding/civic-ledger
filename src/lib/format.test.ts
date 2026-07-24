/** Covers formatOrdinal's suffix rules, including the 11th/12th/13th exception to the usual st/nd/rd pattern. */
import { afterEach, describe, expect, it } from "vitest";

import { formatDate, formatOrdinal } from "@/lib/format";

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

describe("formatDate", (): void => {
  const originalTz: string | undefined = process.env.TZ;

  afterEach((): void => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("formats a bare YYYY-MM-DD date", (): void => {
    expect(formatDate("2026-07-14")).toBe("July 14, 2026");
  });

  it("formats a full ISO 8601 datetime, as bill text versions use", (): void => {
    expect(formatDate("2022-02-15T05:00:00Z")).toBe("February 15, 2022");
  });

  it("falls back to the raw string when it can't be parsed", (): void => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("renders the same calendar date regardless of the runtime's local timezone", (): void => {
    // Without pinning Intl.DateTimeFormat to UTC, this exact case renders one day off in either direction depending on
    // where the code runs — see the comment on formatDate. Covers both extremes: a timezone west of UTC (which would
    // roll a UTC-early-morning timestamp back a day) and one far enough east to roll a UTC-noon timestamp forward a
    // day.
    process.env.TZ = "America/Chicago"; // UTC-6
    expect(formatDate("2022-02-15T05:00:00Z")).toBe("February 15, 2022");
    expect(formatDate("2026-07-14")).toBe("July 14, 2026");

    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    expect(formatDate("2022-02-15T05:00:00Z")).toBe("February 15, 2022");
    expect(formatDate("2026-07-14")).toBe("July 14, 2026");
  });
});
