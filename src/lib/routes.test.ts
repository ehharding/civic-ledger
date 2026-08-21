/**
 * Covers every in-app route builder in `routes.ts`.
 *
 * They are three lines each, but `docs/architecture.md` gives them a rule — "One definition per route shape; never
 * build a route inline" — which means every link to a bill, a Congress's directory, a person, a committee, one view of
 * a committee's records, or a lesson in this app resolves through them. A drift here is not a broken helper, it is
 * every card, seat, sponsor line, tab, pager arrow, and referral link pointing somewhere that doesn't exist.
 *
 * What's pinned down is what each does to the identifier it is handed: the normalization that lets an
 * inconsistently-cased upstream record and a hand-typed URL land on the same page, and — for the ones that need no
 * normalization because their input is already a closed type — that the route they build resolves back to the record it
 * was built from.
 *
 * The suite covers the whole file rather than a chosen subset, which is a rule the file's own history argues for:
 * `committeeRecordsHref` spent its life covered only through the component that renders the tabs, so the one builder
 * that *composes* two independently-changeable pieces — a path builder and a query serializer — was the one nothing
 * here pinned directly.
 */
import { describe, expect, it } from "vitest";

import { billIdentityKey } from "@/lib/congress/bills/model";
import {
  type CommitteeRecordKind,
  committeeRecordKinds,
  DEFAULT_COMMITTEE_RECORDS_QUERY,
} from "@/lib/congress/committees/records";
import { listCongresses, parseCongressParam } from "@/lib/congress/congress-history";
import { findLesson, type Lesson, lessons } from "@/lib/lessons";
import { billHref, committeeHref, committeeRecordsHref, congressBillsHref, lessonHref, memberHref } from "@/lib/routes";

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

describe("congressBillsHref", (): void => {
  it("builds one Congress's directory route", (): void => {
    expect(congressBillsHref(118)).toBe("/bills/118");
  });

  it("accepts a numeric or string Congress, so the switcher's value and listCongresses agree", (): void => {
    // The switcher reads a `<select>` value, which is a string; the sitemap reads `listCongresses`, which is numbers.
    expect(congressBillsHref("118")).toBe(congressBillsHref(118));
  });

  it("resolves back to a Congress the app supports browsing", (): void => {
    // A route this builds and a route `/bills/[congress]` accepts have to be the same set: the sitemap advertises
    // these, so one the route rejected would be a listed page that 404s. @see parseCongressParam.
    for (const entry of listCongresses()) {
      expect(parseCongressParam(congressBillsHref(entry.number).replace("/bills/", ""))).toBe(entry.number);
    }
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

describe("committeeRecordsHref", (): void => {
  it("builds on committeeHref, so the two cannot disagree about where a committee lives", (): void => {
    expect(committeeRecordsHref("house", "hsag00", { kind: "reports", page: 3 })).toBe(
      `${committeeHref("house", "hsag00")}?records=reports&page=3`,
    );
  });

  it("normalizes the system code exactly as a plain committee link does", (): void => {
    expect(committeeRecordsHref("senate", "  SSAP00  ", { kind: "nominations", page: 1 })).toBe(
      "/committees/senate/ssap00?records=nominations",
    );
  });

  it("returns the bare committee URL for the default view, rather than params that both say 'the default'", (): void => {
    expect(committeeRecordsHref("house", "hsag00", DEFAULT_COMMITTEE_RECORDS_QUERY)).toBe(
      committeeHref("house", "hsag00"),
    );
  });

  it("names every collection a committee page can show", (): void => {
    // Every tab is one of these links, so a kind the serializer stopped writing is a tab that silently resolves to the
    // default collection rather than to itself.
    for (const kind of committeeRecordKinds) {
      const href: string = committeeRecordsHref("house", "hsag00", { kind, page: 1 });
      const resolved: CommitteeRecordKind =
        (new URLSearchParams(href.split("?")[1] ?? "").get("records") as CommitteeRecordKind | null) ??
        DEFAULT_COMMITTEE_RECORDS_QUERY.kind;

      expect(resolved).toBe(kind);
    }
  });
});

describe("lessonHref", (): void => {
  it("builds the lesson route from the slug alone", (): void => {
    expect(lessonHref("how-a-bill-becomes-law")).toBe("/learn/how-a-bill-becomes-law");
  });

  it("takes only a slug the registry declares, so an inline one is checked rather than trusted", (): void => {
    // The guarantee is the parameter's type, which is why this reads as a plain equality rather than a normalization
    // case: `lessonHref` no longer accepts a string to normalize. @see LessonSlug.
    expect(lessonHref("what-committees-do")).toBe("/learn/what-committees-do");
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
