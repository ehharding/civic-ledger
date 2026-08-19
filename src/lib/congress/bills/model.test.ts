/**
 * Covers model.ts's pure helpers — the small functions that decide what a bill *is* across the whole app.
 *
 * Three of them carry a documented rule worth pinning down:
 *
 * - `congressGovBillUrl` derives the public record URL from the bill's own identity rather than passing through the
 *   API's self-referential `url` field (docs/data-policy.md, "The Official-Record Link Is Published Where It Can Be,
 *   Derived Where It Can't"). It must never emit a confidently-wrong deep link, which is why an unrecognized type falls
 *   back to the site's home page rather than guessing a path segment. `mapCongressBill` prefers the item endpoint's
 *   published `legislationUrl` over this, but the list endpoint sends none, so the derivation still covers every card.
 * - `billIdentityKey` is the single answer to "is this the same bill?", so a live record and a route param naming the
 *   same bill have to produce the same key despite differing in case and in the type of `congress`.
 * - `compareBillsByRecency` has to stay total: a bill carrying no date at all must sort somewhere predictable rather
 *   than wherever an undefined comparison happens to put it.
 *
 * `BILL_TYPE_CODES` and `BILL_TYPE_PATH_SEGMENTS` are derived from the same map `congressGovBillUrl` reads, so they are
 * checked here too — the point of deriving them was that they can no longer fall out of step, and that only stays true
 * if something asserts it.
 */
import { describe, expect, it } from "vitest";

import {
  BILL_TYPE_CODES,
  BILL_TYPE_PATH_SEGMENTS,
  type BillStage,
  billIdentityKey,
  billStageLabels,
  billStages,
  CONGRESS_GOV_HOME,
  compareBillsByRecency,
  congressGovAmendmentUrl,
  congressGovBillUrl,
  describeAmendmentDetail,
  describeBillCollection,
  describeOriginalCosponsors,
  describeWithdrawnCosponsors,
  formatAmendmentCitation,
  type LegislativeBill,
} from "@/lib/congress/bills/model";

/**
 * A minimal bill, overridable per test. Only the fields a given assertion actually reads are ever meaningful.
 */
function bill(overrides: Partial<LegislativeBill> = {}): LegislativeBill {
  return {
    congress: 119,
    type: "HR",
    number: "284",
    title: "A Test Bill",
    originChamber: "House",
    latestAction: { text: "Referred to the Committee on Energy and Commerce." },
    stage: "committee",
    officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

describe("billIdentityKey", (): void => {
  it("builds the congress-type-number key", (): void => {
    expect(billIdentityKey({ congress: 119, type: "HR", number: "284" })).toBe("119-HR-284");
  });

  it("gives a live record and a route param naming the same bill the same key", (): void => {
    const fromRecord: string = billIdentityKey({ congress: 119, type: "HR", number: "284" });
    const fromRoute: string = billIdentityKey({ congress: "119", type: "hr", number: "284" });

    expect(fromRoute).toBe(fromRecord);
  });

  it("distinguishes bills that differ only by chamber, so HR 1 and S 1 never collide", (): void => {
    expect(billIdentityKey({ congress: 119, type: "hr", number: "1" })).not.toBe(
      billIdentityKey({ congress: 119, type: "s", number: "1" }),
    );
  });
});

describe("congressGovBillUrl", (): void => {
  it("builds the public record URL, not the self-referential API one", (): void => {
    expect(congressGovBillUrl({ congress: 119, type: "HR", number: "284" })).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/284",
    );
    expect(congressGovBillUrl({ congress: 118, type: "sjres", number: "12" })).toBe(
      "https://www.congress.gov/bill/118th-congress/senate-joint-resolution/12",
    );
  });

  it("never points a reader at api.congress.gov, which would serve them JSON or a 403", (): void => {
    expect(congressGovBillUrl({ congress: 119, type: "HR", number: "284" })).not.toContain("api.congress.gov");
  });

  it("resolves a real public path for every type it claims to support", (): void => {
    for (const type of BILL_TYPE_CODES) {
      expect(congressGovBillUrl({ congress: 119, type, number: "1" })).not.toBe(CONGRESS_GOV_HOME);
    }
  });

  it("falls back to the site home rather than guessing a path for an unrecognized type", (): void => {
    expect(congressGovBillUrl({ congress: 119, type: "hres99", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovBillUrl({ congress: 119, type: "", number: "1" })).toBe(CONGRESS_GOV_HOME);
  });

  it("falls back to the site home for a congress number that isn't a positive whole number", (): void => {
    expect(congressGovBillUrl({ congress: 0, type: "hr", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovBillUrl({ congress: -119, type: "hr", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovBillUrl({ congress: "not-a-congress", type: "hr", number: "1" })).toBe(CONGRESS_GOV_HOME);
  });
});

describe("describeAmendmentDetail", (): void => {
  it("attributes the tally to this page rather than to Congress.gov, since it counted a field", (): void => {
    expect(describeAmendmentDetail(17, 250)).toBe(
      "17 of them carry the purpose the record states; the rest are published here as citations only, with their text on the amendment's own record.",
    );
  });

  it("says outright when the record published no purpose for any of them", (): void => {
    // The common shape, and the sentence that keeps a screen of bare citations from reading as a fault in this app.
    expect(describeAmendmentDetail(0, 40)).toBe(
      "Congress.gov publishes no purpose text for any of them here, so each row is the amendment's citation and a link to its own record.",
    );
  });

  it("drops the qualifier when there is nothing to qualify", (): void => {
    expect(describeAmendmentDetail(6, 6)).toBe("Each carries the purpose the record states for it.");
  });

  it("says nothing about a collection with nothing in it", (): void => {
    // Unreachable from the section, which only calls this once it has rows — but the function is correct on its own
    // terms rather than only in the one state its caller is in today.
    expect(describeAmendmentDetail(0, 0)).toBe("");
  });
});

describe("congressGovAmendmentUrl", (): void => {
  it("builds the public amendment page for both types Congress.gov publishes", (): void => {
    // Not a guessed pattern: Congress.gov publishes exactly these URLs itself, in the `latestAction.links` array on an
    // amendment's own item-level record. @see congressGovAmendmentUrl.
    expect(congressGovAmendmentUrl({ congress: 119, type: "SAMDT", number: "2849" })).toBe(
      "https://www.congress.gov/amendment/119th-congress/senate-amendment/2849",
    );
    expect(congressGovAmendmentUrl({ congress: 117, type: "hamdt", number: "74" })).toBe(
      "https://www.congress.gov/amendment/117th-congress/house-amendment/74",
    );
  });

  it("never points a reader at api.congress.gov, which would serve them JSON or a 403", (): void => {
    expect(congressGovAmendmentUrl({ congress: 119, type: "SAMDT", number: "2849" })).not.toContain("api.congress.gov");
  });

  it("falls back to the site home rather than guessing a path for an unrecognized type", (): void => {
    expect(congressGovAmendmentUrl({ congress: 119, type: "SUAMDT", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovAmendmentUrl({ congress: 119, type: "", number: "1" })).toBe(CONGRESS_GOV_HOME);
  });

  it("falls back to the site home for a congress number that isn't a positive whole number", (): void => {
    expect(congressGovAmendmentUrl({ congress: 0, type: "SAMDT", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovAmendmentUrl({ congress: -119, type: "SAMDT", number: "1" })).toBe(CONGRESS_GOV_HOME);
    expect(congressGovAmendmentUrl({ congress: "not-a-congress", type: "SAMDT", number: "1" })).toBe(CONGRESS_GOV_HOME);
  });
});

describe("formatAmendmentCitation", (): void => {
  it("writes the citation the way Congress's own records do", (): void => {
    // The wire code is `SAMDT`; nowhere a reader goes to check this will call it that.
    expect(formatAmendmentCitation({ type: "SAMDT", number: "2849" })).toBe("S.Amdt. 2849");
    expect(formatAmendmentCitation({ type: "HAMDT", number: "74" })).toBe("H.Amdt. 74");
  });

  it("shows an unrecognized type as published rather than inventing an abbreviation for it", (): void => {
    expect(formatAmendmentCitation({ type: "SUAMDT", number: "3" })).toBe("SUAMDT 3");
  });
});

describe("bill type code sets", (): void => {
  it("covers all eight bill and resolution types Congress.gov serves", (): void => {
    expect(BILL_TYPE_CODES.size).toBe(8);
    expect(BILL_TYPE_PATH_SEGMENTS.size).toBe(8);
  });

  it("keeps the upper-cased and path-segment views in step, since both are derived from one map", (): void => {
    const loweredCodes: string[] = [...BILL_TYPE_CODES].map((code: string): string => code.toLowerCase()).sort();

    expect(loweredCodes).toEqual([...BILL_TYPE_PATH_SEGMENTS].sort());
  });

  it("holds the codes in the case each is used in, so neither set needs re-casing at its call sites", (): void => {
    for (const code of BILL_TYPE_CODES) expect(code).toBe(code.toUpperCase());
    for (const segment of BILL_TYPE_PATH_SEGMENTS) expect(segment).toBe(segment.toLowerCase());
  });
});

describe("compareBillsByRecency", (): void => {
  it("puts the more recently introduced bill first", (): void => {
    const older: LegislativeBill = bill({ number: "1", introducedDate: "2025-01-10" });
    const newer: LegislativeBill = bill({ number: "2", introducedDate: "2026-03-04" });

    expect([older, newer].sort(compareBillsByRecency).map((b: LegislativeBill): string => b.number)).toEqual([
      "2",
      "1",
    ]);
  });

  it("falls back to the latest action's date for a bill carrying no introduction date", (): void => {
    const dated: LegislativeBill = bill({ number: "1", introducedDate: "2025-01-10" });
    const actionOnly: LegislativeBill = bill({
      number: "2",
      introducedDate: undefined,
      latestAction: { text: "Passed House.", date: "2026-05-01" },
    });

    expect([dated, actionOnly].sort(compareBillsByRecency).map((b: LegislativeBill): string => b.number)).toEqual([
      "2",
      "1",
    ]);
  });

  it("sorts bills with no usable date last rather than ahead of everything dated", (): void => {
    const undatedFirst: LegislativeBill = bill({ number: "1", introducedDate: undefined });
    const dated: LegislativeBill = bill({ number: "2", introducedDate: "2025-01-10" });

    expect([undatedFirst, dated].sort(compareBillsByRecency).map((b: LegislativeBill): string => b.number)).toEqual([
      "2",
      "1",
    ]);
  });

  it("treats two bills sharing a date as equal, so neither jumps the other", (): void => {
    const a: LegislativeBill = bill({ number: "1", introducedDate: "2025-01-10" });
    const b: LegislativeBill = bill({ number: "2", introducedDate: "2025-01-10" });

    expect(compareBillsByRecency(a, b)).toBe(0);
  });
});

describe("billStageLabels", (): void => {
  it("labels every stage the journey stepper can render, so no stage falls through undefined", (): void => {
    for (const stage of billStages) {
      expect(billStageLabels[stage as BillStage]).toBeTruthy();
    }
  });
});

/**
 * The whole point of this function is *who the sentence credits*, so every case is asserted on the wording rather than
 * on a count: a figure Congress.gov published is a claim about the congressional record, and a figure this app arrived
 * at by counting what it fetched is a claim about this page. Nothing here may state one and mean the other.
 */
describe("describeBillCollection", (): void => {
  it("credits Congress.gov when its published count matches what is shown", (): void => {
    expect(describeBillCollection({ shown: 59, published: 59, noun: "action" })).toBe(
      "Congress.gov records 59 actions on this bill.",
    );
  });

  it("names both figures when they disagree, rather than silently printing the shorter one", (): void => {
    expect(describeBillCollection({ shown: 58, published: 59, noun: "action" })).toBe(
      "Congress.gov records 59 actions on this bill; this page shows 58.",
    );
  });

  it("claims only what this page shows when no count was published", (): void => {
    // Every bill from the list endpoint, every preview fixture, and every failed detail read lands here. None of them
    // may produce a sentence beginning "Congress.gov records".
    expect(describeBillCollection({ shown: 2, noun: "action" })).toBe("This page shows 2 actions for this bill.");
  });

  it("says nothing at all when there is nothing shown and nothing published", (): void => {
    // The caller renders its own "none on file" line for this, which distinguishes a preview from a live empty record.
    expect(describeBillCollection({ shown: 0, noun: "action" })).toBe("");
  });

  it("pluralizes on the figure it is actually printing", (): void => {
    expect(describeBillCollection({ shown: 1, published: 1, noun: "committee" })).toBe(
      "Congress.gov records 1 committee on this bill.",
    );
    // The published figure drives the noun even when the shown one is 1, since that is the number beside it.
    expect(describeBillCollection({ shown: 1, published: 5, noun: "committee" })).toBe(
      "Congress.gov records 5 committees on this bill; this page shows 1.",
    );
  });

  it("takes an explicit plural for a noun an `s` would mangle", (): void => {
    expect(
      describeBillCollection({
        shown: 3,
        published: 3,
        noun: "Congressional Research Service summary",
        pluralNoun: "Congressional Research Service summaries",
      }),
    ).toBe("Congress.gov records 3 Congressional Research Service summaries on this bill.");
  });
});

describe("describeWithdrawnCosponsors", (): void => {
  it("names how many withdrew when the two published figures disagree", (): void => {
    expect(describeWithdrawnCosponsors({ current: 40, includingWithdrawn: 43 })).toBe(
      "3 more members cosponsored this bill and later withdrew, so those names are counted by Congress.gov but absent from the list below.",
    );
  });

  it("uses the singular for exactly one withdrawal", (): void => {
    expect(describeWithdrawnCosponsors({ current: 40, includingWithdrawn: 41 })).toBe(
      "1 more member cosponsored this bill and later withdrew, so that name is counted by Congress.gov but absent from the list below.",
    );
  });

  it("says nothing when the figures agree, which is the shape of nearly every bill", (): void => {
    expect(describeWithdrawnCosponsors({ current: 40, includingWithdrawn: 40 })).toBe("");
  });

  it("says nothing when either figure is missing, rather than subtracting from an unknown", (): void => {
    expect(describeWithdrawnCosponsors({ current: 40 })).toBe("");
    expect(describeWithdrawnCosponsors({ includingWithdrawn: 43 })).toBe("");
    expect(describeWithdrawnCosponsors(undefined)).toBe("");
  });

  it("says nothing rather than reporting a negative withdrawal, which should not happen", (): void => {
    expect(describeWithdrawnCosponsors({ current: 43, includingWithdrawn: 40 })).toBe("");
  });
});

describe("describeOriginalCosponsors", (): void => {
  it("splits the list between original signers and those who joined later", (): void => {
    expect(describeOriginalCosponsors(2, 6)).toBe(
      "2 of the names below were on the bill when it was introduced; the other 4 joined later.",
    );
  });

  it("uses the singular verb for exactly one original cosponsor", (): void => {
    expect(describeOriginalCosponsors(1, 6)).toBe(
      "1 of the names below was on the bill when it was introduced; the other 5 joined later.",
    );
  });

  it("does not claim a remainder that does not exist when every name is original", (): void => {
    // The bug this pins: "3 of the names below were… ; the other 0 joined later" on the very common small bill whose
    // cosponsors all signed at introduction.
    expect(describeOriginalCosponsors(3, 3)).toBe(
      "Every one of them — all 3 — was on the bill when it was introduced.",
    );
  });

  it("says so plainly when none of them were original", (): void => {
    expect(describeOriginalCosponsors(0, 4)).toBe("None of the names below were on the bill when it was introduced.");
  });

  it("says nothing when there is nothing listed to describe", (): void => {
    expect(describeOriginalCosponsors(0, 0)).toBe("");
  });
});
