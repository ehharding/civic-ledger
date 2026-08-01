/**
 * Covers all four in-app route builders.
 *
 * They are three lines each, but `docs/architecture.md` gives them a rule — "One definition per route shape; never
 * build a route inline" — which means every link to a bill, a person, a committee, or a lesson in this app resolves
 * through them. A drift here is not a broken helper, it is every card, seat, sponsor line, and referral link pointing
 * somewhere that doesn't exist.
 *
 * What's pinned down is the normalization each performs, since that is what lets an inconsistently-cased upstream
 * record and a hand-typed URL land on the same page.
 */
import { describe, expect, it } from "vitest";

import { billHref } from "@/lib/bill-route";
import { committeeHref } from "@/lib/committee-route";
import { billIdentityKey } from "@/lib/congress/types";
import { lessonHref } from "@/lib/lesson-route";
import { findLesson, type Lesson, lessons } from "@/lib/lessons";
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

describe("committeeHref", (): void => {
  it("builds the committee route from the chamber and system code together", (): void => {
    expect(committeeHref("house", "hsag00")).toBe("/committees/house/hsag00");
  });

  it("lower-cases and trims the system code, so every link to one committee points at one URL", (): void => {
    expect(committeeHref("senate", "SSAP00")).toBe("/committees/senate/ssap00");
    expect(committeeHref("senate", "  ssap00  ")).toBe("/committees/senate/ssap00");
  });

  it("carries the joint chamber, which is a committee-only chamber the member routes never see", (): void => {
    expect(committeeHref("joint", "jsec00")).toBe("/committees/joint/jsec00");
  });

  it("keeps the chamber in the path, since the upstream lookup is keyed on both", (): void => {
    // The same system code under a different chamber is a different page — which is the whole reason the chamber is a
    // path segment rather than something the route has to guess back. @see committeeHref.
    expect(committeeHref("house", "hsag00")).not.toBe(committeeHref("senate", "hsag00"));
  });
});

describe("lessonHref", (): void => {
  it("builds the lesson route from the slug alone", (): void => {
    expect(lessonHref("how-a-bill-becomes-law")).toBe("/learn/how-a-bill-becomes-law");
  });

  it("lower-cases and trims, matching what findLesson accepts", (): void => {
    expect(lessonHref("  How-Congress-Votes  ")).toBe("/learn/how-congress-votes");
  });

  it("round-trips: every route it builds resolves back to the lesson it was built from", (): void => {
    // The sitemap, the hub index, and each lesson's own callout all go through this. A slug that builds a URL the route
    // can't resolve is a listed page that 404s.
    for (const lesson of lessons) {
      const slug: string = lessonHref(lesson.slug).replace("/learn/", "");
      expect(findLesson(slug)).toBe(lesson as Lesson);
    }
  });
});
