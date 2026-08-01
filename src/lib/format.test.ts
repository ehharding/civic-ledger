/**
 * Covers formatOrdinal's suffix rules (including the 11th/12th/13th exception to the usual st/nd/rd pattern), the
 * timezone pinning that keeps formatDate from rolling a date back a day, the two comparison rules every ordering in the
 * app shares, and the two small display helpers the rest of it leans on for counts and for casing upstream free text.
 */
import { afterEach, describe, expect, it } from "vitest";

import { compareIsoDatesDesc, compareText, formatDate, formatOrdinal, pluralize, toTitleCase } from "@/lib/format";

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

describe("pluralize", (): void => {
  it("uses the singular for exactly one and the plural for anything else", (): void => {
    expect(pluralize(1, "Member")).toBe("Member");
    expect(pluralize(0, "Member")).toBe("Members");
    expect(pluralize(2, "Member")).toBe("Members");
  });

  it("takes an explicit plural where adding an s would be wrong", (): void => {
    expect(pluralize(1, "Match", "Matches")).toBe("Match");
    expect(pluralize(3, "Match", "Matches")).toBe("Matches");
  });

  it("preserves the casing it was given, since these are rendered inline in copy", (): void => {
    expect(pluralize(2, "seat")).toBe("seats");
    expect(pluralize(2, "Record")).toBe("Records");
  });
});

describe("toTitleCase", (): void => {
  it("cases an all-lower or all-upper label", (): void => {
    expect(toTitleCase("new york")).toBe("New York");
    expect(toTitleCase("NEW YORK")).toBe("New York");
  });

  it("keeps small words lower in the middle of a label but not at either end", (): void => {
    expect(toTitleCase("district of columbia")).toBe("District of Columbia");
    expect(toTitleCase("of")).toBe("Of");
  });

  it("upper-cases a dotted initialism rather than title-casing it", (): void => {
    expect(toTitleCase("u.s. virgin islands")).toBe("U.S. Virgin Islands");
  });

  it("leaves a word that is already mixed case exactly as it arrived", (): void => {
    // Casing that upstream took the trouble to get right is a decision, not noise to normalize away.
    expect(toTitleCase("McCarthy")).toBe("McCarthy");
    expect(toTitleCase("DeSoto County")).toBe("DeSoto County");
  });

  it("capitalizes across a hyphen", (): void => {
    expect(toTitleCase("wilkes-barre")).toBe("Wilkes-Barre");
  });

  it("collapses irregular whitespace, so two spellings cannot become two options", (): void => {
    expect(toTitleCase("  northern   mariana  islands ")).toBe("Northern Mariana Islands");
  });

  it("returns an empty string for blank input rather than a stray space", (): void => {
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase("   ")).toBe("");
  });
});

describe("compareText", (): void => {
  it("orders plain ASCII names alphabetically", (): void => {
    expect(compareText("Alvarez", "Bennett")).toBeLessThan(0);
    expect(compareText("Bennett", "Alvarez")).toBeGreaterThan(0);
    expect(compareText("Bennett", "Bennett")).toBe(0);
  });

  it("collates diacritics and apostrophes where a reader expects them, not where their code points fall", (): void => {
    // Núñez sorts among the N names. By code point, ñ (U+00F1) is past every unaccented letter, which would file it
    // after "Nz" — and, in a member grid, well away from the other N's.
    expect(compareText("Núñez", "Ortiz")).toBeLessThan(0);
    expect(compareText("Nash", "Núñez")).toBeLessThan(0);
    expect(compareText("O'Halleran", "Ochoa")).toBeLessThan(0);
  });

  it("is pinned to one locale, so a server and a browser cannot disagree about an ordering", (): void => {
    // The failure this guards against is a hydration mismatch, not a wrong-looking list: da-DK and sv-SE place Ø past
    // Z, so an unpinned collator would order these two differently on either side of the app.
    const ordered: string[] = ["Ødegård", "Zimmerman"].sort(compareText);

    expect(ordered).toEqual(["Ødegård", "Zimmerman"]);
  });
});

describe("compareIsoDatesDesc", (): void => {
  it("puts the more recent date first, for both bare dates and full timestamps", (): void => {
    expect(compareIsoDatesDesc("2026-07-14", "2025-01-03")).toBeLessThan(0);
    expect(compareIsoDatesDesc("2025-01-03", "2026-07-14")).toBeGreaterThan(0);
    expect(compareIsoDatesDesc("2022-02-15T05:00:00Z", "2022-02-14T05:00:00Z")).toBeLessThan(0);
  });

  it("treats identical dates as ties, so a caller's own tiebreak survives", (): void => {
    expect(compareIsoDatesDesc("2026-07-14", "2026-07-14")).toBe(0);
  });

  it("sorts undated records last without needing a special case", (): void => {
    const ordered: string[] = ["", "2025-01-03", "", "2026-07-14"].sort(compareIsoDatesDesc);

    expect(ordered).toEqual(["2026-07-14", "2025-01-03", "", ""]);
  });

  it("orders across a year, month, and day boundary that string comparison could get wrong", (): void => {
    // Zero-padding is what makes plain comparison correct here: "2026-01-09" < "2026-01-10" only because the day is two
    // digits wide.
    const ordered: string[] = ["2026-01-09", "2026-01-10", "2025-12-31", "2026-02-01"].sort(compareIsoDatesDesc);

    expect(ordered).toEqual(["2026-02-01", "2026-01-10", "2026-01-09", "2025-12-31"]);
  });
});

describe("toTitleCase with irregular hyphenation", (): void => {
  it("leaves an empty hyphen segment alone rather than reaching for a character that isn't there", (): void => {
    // Upstream place names are free text, so a doubled or trailing hyphen is a shape this actually meets. Splitting on
    // "-" yields an empty segment there, and indexing into it would be reading position zero of an empty string.
    expect(toTitleCase("wilkes--barre")).toBe("Wilkes--Barre");
    expect(toTitleCase("-barre")).toBe("-Barre");
    expect(toTitleCase("wilkes-")).toBe("Wilkes-");
  });
});
