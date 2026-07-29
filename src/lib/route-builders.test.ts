/**
 * Covers the two in-app route builders.
 *
 * They are three lines each, but `docs/architecture.md` gives them a rule — "One definition per route shape; never
 * build a route inline" — which means every link to a bill or a person in this app resolves through them. A drift here
 * is not a broken helper, it is every card, seat, and sponsor line pointing somewhere that doesn't exist.
 *
 * What's pinned down is the normalization each performs, since that is what lets an inconsistently-cased upstream
 * record and a hand-typed URL land on the same page.
 */
import { describe, expect, it } from "vitest";

import { billHref } from "@/lib/bill-route";
import { billIdentityKey } from "@/lib/congress/types";
import { memberHref } from "@/lib/member-route";

describe("billHref", (): void => {
  it("builds the bill detail route", (): void => {
    expect(billHref({ congress: 119, type: "HR", number: "284" })).toBe("/bills/119/hr/284");
  });

  it("lower-cases the type segment, matching the route's own shape", (): void => {
    expect(billHref({ congress: 119, type: "HJRES", number: "66" })).toBe("/bills/119/hjres/66");
  });

  it("accepts a numeric or string congress, so a live record and route params agree", (): void => {
    expect(billHref({ congress: "119", type: "hr", number: "284" })).toBe(
      billHref({ congress: 119, type: "HR", number: "284" }),
    );
  });

  it("round-trips: the route it builds names the same bill the identity key does", (): void => {
    const record = { congress: 119, type: "HR", number: "284" };
    const segments: string[] = billHref(record).split("/").filter(Boolean);

    expect(billIdentityKey({ congress: segments[1] ?? "", type: segments[2] ?? "", number: segments[3] ?? "" })).toBe(
      billIdentityKey(record),
    );
  });
});

describe("memberHref", (): void => {
  it("builds the member route from the Bioguide ID alone", (): void => {
    expect(memberHref("L000174")).toBe("/members/L000174");
  });

  it("upper-cases and trims, so every link to one person points at one URL", (): void => {
    expect(memberHref("l000174")).toBe("/members/L000174");
    expect(memberHref("  l000174  ")).toBe("/members/L000174");
  });

  it("still builds a route for a preview placeholder ID, which the page resolves locally", (): void => {
    expect(memberHref("PREVIEW-1")).toBe("/members/PREVIEW-1");
  });
});
