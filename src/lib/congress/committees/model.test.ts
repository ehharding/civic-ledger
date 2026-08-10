/**
 * Covers the committee model's display helpers.
 *
 * These live in the model rather than at their call sites precisely so they can be tested here instead of only through
 * a rendered page — `describeCommittee`'s own documentation says so, and names the route `generateMetadata` it was
 * lifted out of. This file is the other half of that argument: the wording a reader is shown is a fact about the
 * product, and it should fail a test when it changes, not a review.
 *
 * The history-year extraction gets the closest attention, because its correctness is invisible. It reads the year off
 * the ISO string rather than through a `Date` specifically so a January or December timestamp cannot shift a year
 * across a timezone — a bug that would never appear in a UTC test run and would misdate committees for half the world.
 */
import { describe, expect, it } from "vitest";

import {
  type CommitteeChamber,
  type CommitteeHistoryEntry,
  type CommitteeType,
  committeeSearchTerms,
  committeeTypeLabels,
  committeeTypeNounPhrases,
  committeeTypes,
  describeCommittee,
  formatCommitteeHistoryYears,
  isCommitteeSystemCode,
  normalizeCommitteeChamber,
  normalizeCommitteeType,
} from "@/lib/congress/committees/model";

/** A history entry with only the fields a given case is about. */
function entry(overrides: Partial<CommitteeHistoryEntry> = {}): CommitteeHistoryEntry {
  return { name: "Committee on Agriculture", ...overrides };
}

describe("describeCommittee", (): void => {
  it("names the type and the chamber as a complete sentence", (): void => {
    expect(describeCommittee({ chamber: "house", type: "standing" })).toBe(
      "Standing committee of the House of Representatives.",
    );
    expect(describeCommittee({ chamber: "senate", type: "select" })).toBe("Select committee of the Senate.");
  });

  it("drops the article for a joint committee, which sits in no single chamber", (): void => {
    // "of the Both Chambers of Congress" is the failure this branch exists to prevent.
    expect(describeCommittee({ chamber: "joint", type: "joint" })).toBe(
      "Joint committee of both chambers of Congress.",
    );
  });

  it("uses the noun phrase rather than the chip label", (): void => {
    // The two genuinely differ: "Commission or Caucus" is the right chip, and "Commission or Caucus committee" is not a
    // phrase anyone would write.
    expect(describeCommittee({ chamber: "house", type: "commission" })).toBe(
      "Commission or caucus of the House of Representatives.",
    );
    expect(describeCommittee({ chamber: "house", type: "other" })).toBe("Committee of the House of Representatives.");
  });

  it("produces a complete sentence for every type and chamber in the model", (): void => {
    // A new committee type added to the union without a noun phrase would otherwise surface as "undefined of the
    // Senate." on a page description — a string that reads as broken and would never throw.
    const chambers: CommitteeChamber[] = ["house", "senate", "joint"];

    for (const type of committeeTypes) {
      for (const chamber of chambers) {
        const described: string = describeCommittee({ chamber, type });

        expect(described).toMatch(/^[A-Z].*\.$/);
        expect(described).not.toMatch(/undefined/);
      }
    }
  });

  it("keeps a noun phrase and a label for every type", (): void => {
    for (const type of committeeTypes as readonly CommitteeType[]) {
      expect(committeeTypeNounPhrases[type]?.length).toBeGreaterThan(0);
      expect(committeeTypeLabels[type]?.length).toBeGreaterThan(0);
    }
  });
});

describe("formatCommitteeHistoryYears", (): void => {
  it("reads a closed span as its two years", (): void => {
    expect(
      formatCommitteeHistoryYears(entry({ startDate: "1975-01-14T00:00:00Z", endDate: "1995-01-04T00:00:00Z" })),
    ).toBe("1975–1995");
  });

  it("reads an open span as running to the present", (): void => {
    expect(formatCommitteeHistoryYears(entry({ startDate: "2019-01-03T00:00:00Z" }))).toBe("2019–present");
  });

  it("returns an empty string when there is no start date to anchor the span", (): void => {
    // Callers omit the line entirely rather than printing a dash with nothing around it.
    expect(formatCommitteeHistoryYears(entry())).toBe("");
    expect(formatCommitteeHistoryYears(entry({ endDate: "1995-01-04T00:00:00Z" }))).toBe("");
    expect(formatCommitteeHistoryYears(entry({ startDate: "   " }))).toBe("");
  });

  it("ignores an unparseable date rather than printing part of it", (): void => {
    expect(formatCommitteeHistoryYears(entry({ startDate: "not-a-date" }))).toBe("");
    expect(formatCommitteeHistoryYears(entry({ startDate: "1975-01-14T00:00:00Z", endDate: "unknown" }))).toBe(
      "1975–present",
    );
  });

  it("does not shift the year across a timezone", (): void => {
    // The whole reason the year is read off the string. `new Date("1975-01-01T00:00:00Z").getFullYear()` is 1974 in any
    // timezone west of UTC, and `"1994-12-31T23:00:00Z"` is 1995 in any timezone east of it — so a Date-based
    // implementation passes in CI and misdates committees for half the world.
    expect(
      formatCommitteeHistoryYears(entry({ startDate: "1975-01-01T00:00:00Z", endDate: "1994-12-31T23:00:00Z" })),
    ).toBe("1975–1994");
  });

  it("uses an en dash, matching every other span in the app", (): void => {
    const span: string = formatCommitteeHistoryYears(
      entry({ startDate: "1975-01-14T00:00:00Z", endDate: "1995-01-04T00:00:00Z" }),
    );

    expect(span).toContain("–");
    expect(span).not.toContain("-");
  });
});

describe("normalizeCommitteeChamber", (): void => {
  it("recognizes each chamber a committee can belong to, in any case", (): void => {
    expect(normalizeCommitteeChamber("House")).toBe("house");
    expect(normalizeCommitteeChamber("House of Representatives")).toBe("house");
    expect(normalizeCommitteeChamber("SENATE")).toBe("senate");
    expect(normalizeCommitteeChamber(" Joint ")).toBe("joint");
  });

  it("rejects the API's own NoChamber records rather than filing them under a body they are not part of", (): void => {
    expect(normalizeCommitteeChamber("NoChamber")).toBeNull();
  });

  it("rejects an absent or unrecognized chamber", (): void => {
    expect(normalizeCommitteeChamber(undefined)).toBeNull();
    expect(normalizeCommitteeChamber("")).toBeNull();
    expect(normalizeCommitteeChamber("Continental Congress")).toBeNull();
  });
});

describe("normalizeCommitteeType", (): void => {
  it("maps each upstream type onto the category this app groups by", (): void => {
    expect(normalizeCommitteeType("Standing")).toBe("standing");
    expect(normalizeCommitteeType("Select")).toBe("select");
    expect(normalizeCommitteeType("Special")).toBe("select");
    expect(normalizeCommitteeType("Joint")).toBe("joint");
    expect(normalizeCommitteeType("Commission or Caucus")).toBe("commission");
    expect(normalizeCommitteeType("Caucus")).toBe("commission");
  });

  it("falls back to 'other' rather than throwing, so a new upstream category changes a label and nothing else", (): void => {
    expect(normalizeCommitteeType(undefined)).toBe("other");
    expect(normalizeCommitteeType("")).toBe("other");
    expect(normalizeCommitteeType("Advisory Panel")).toBe("other");
  });
});

describe("isCommitteeSystemCode", (): void => {
  it("accepts the letters-then-two-digits form Congress.gov issues, in any case", (): void => {
    expect(isCommitteeSystemCode("hsag00")).toBe(true);
    expect(isCommitteeSystemCode(" SSAF00 ")).toBe(true);
  });

  it("rejects anything that is not that form, including an absent value", (): void => {
    // This guard is what keeps a route-derived segment out of an outbound URL, so it has to reject rather than escape.
    expect(isCommitteeSystemCode(undefined)).toBe(false);
    expect(isCommitteeSystemCode("")).toBe(false);
    expect(isCommitteeSystemCode("preview-01")).toBe(false);
    expect(isCommitteeSystemCode("hsag0")).toBe(false);
    expect(isCommitteeSystemCode("../secrets")).toBe(false);
  });
});

describe("committeeSearchTerms", (): void => {
  it("adds the leading form so 'Joint Economic Committee' is findable as 'committee on joint economic'", (): void => {
    expect(committeeSearchTerms("Joint Economic Committee")).toEqual([
      "joint economic committee",
      "committee on joint economic",
    ]);
  });

  it("returns only the name itself when no trailing 'Committee' can be moved", (): void => {
    expect(committeeSearchTerms("Committee on Agriculture")).toEqual(["committee on agriculture"]);
  });

  it("yields nothing for an empty or whitespace-only name", (): void => {
    expect(committeeSearchTerms("")).toEqual([]);
    expect(committeeSearchTerms("   ")).toEqual([]);
  });
});
