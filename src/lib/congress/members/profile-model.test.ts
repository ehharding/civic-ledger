/**
 * Covers the member-profile half of model.ts: the Bioguide ID guard that decides whether an official biography can
 * honestly be linked, and the display helpers the member page's heading and service record are built from.
 */
import { describe, expect, it } from "vitest";

import {
  bioguideUrl,
  describeMemberService,
  formatMemberName,
  formatMemberTitle,
  formatTermYears,
  isBioguideId,
  type MemberProfile,
  type MemberTerm,
} from "@/lib/congress/members/model";

function profile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    bioguideId: "L000174",
    name: "Leahy, Patrick J.",
    party: "democratic",
    chamber: "senate",
    currentMember: true,
    terms: [],
    leadership: [],
    ...overrides,
  };
}

function term(overrides: Partial<MemberTerm> = {}): MemberTerm {
  return { chamber: "senate", ...overrides };
}

describe("isBioguideId", (): void => {
  it("accepts the letter-plus-six-digits form Congress.gov issues", (): void => {
    expect(isBioguideId("L000174")).toBe(true);
    expect(isBioguideId("l000174")).toBe(true);
    expect(isBioguideId("  L000174  ")).toBe(true);
  });

  it("rejects anything else, including the preview fixtures' deliberately impossible IDs", (): void => {
    expect(isBioguideId("PREVIEW-1")).toBe(false);
    expect(isBioguideId("L00017")).toBe(false);
    expect(isBioguideId("L0001744")).toBe(false);
    expect(isBioguideId("1000174")).toBe(false);
    expect(isBioguideId("")).toBe(false);
    expect(isBioguideId(undefined)).toBe(false);
  });
});

describe("bioguideUrl", (): void => {
  it("builds the Biographical Directory URL for a real ID", (): void => {
    expect(bioguideUrl("L000174")).toBe("https://bioguide.congress.gov/search/bio/L000174");
  });

  it("normalizes case so one member always produces one URL", (): void => {
    expect(bioguideUrl("l000174")).toBe("https://bioguide.congress.gov/search/bio/L000174");
  });

  it("refuses to link an ID the directory could never resolve", (): void => {
    // A placeholder member must never point at a real person's biography.
    expect(bioguideUrl("PREVIEW-1")).toBeUndefined();
  });
});

describe("formatMemberTitle", (): void => {
  it("prefers the upstream memberType, which is the only thing that names a Delegate", (): void => {
    expect(formatMemberTitle(profile({ chamber: "house", terms: [term({ memberType: "Delegate" })] }))).toBe(
      "Delegate",
    );
    expect(
      formatMemberTitle(profile({ chamber: "house", terms: [term({ memberType: "Resident Commissioner" })] })),
    ).toBe("Resident Commissioner");
  });

  it("falls back to the chamber's generic title when no memberType is on file", (): void => {
    expect(formatMemberTitle(profile({ chamber: "senate", terms: [term()] }))).toBe("Senator");
    expect(formatMemberTitle(profile({ chamber: "house", terms: [term({ chamber: "house" })] }))).toBe(
      "Representative",
    );
  });

  it("reads the title off the most recent term for a member who changed chambers", (): void => {
    const moved: MemberProfile = profile({
      chamber: "senate",
      terms: [term({ memberType: "Senator" }), term({ chamber: "house", memberType: "Representative" })],
    });

    expect(formatMemberTitle(moved)).toBe("Senator");
  });
});

describe("formatMemberName", (): void => {
  it("prefers reading order for prose", (): void => {
    expect(formatMemberName(profile({ directOrderName: "Patrick J. Leahy" }))).toBe("Patrick J. Leahy");
  });

  it("falls back to the sortable form rather than rendering nothing", (): void => {
    expect(formatMemberName(profile())).toBe("Leahy, Patrick J.");
    expect(formatMemberName(profile({ directOrderName: "   " }))).toBe("Leahy, Patrick J.");
  });
});

describe("formatTermYears", (): void => {
  it("renders a completed term as a span", (): void => {
    expect(formatTermYears(term({ startYear: 2019, endYear: 2021 }))).toBe("2019–2021");
  });

  it("marks a term still being served as ongoing rather than inventing an end year", (): void => {
    expect(formatTermYears(term({ startYear: 2025 }))).toBe("2025–present");
  });

  it("returns an empty string when there is no start year, so callers can omit the line", (): void => {
    expect(formatTermYears(term())).toBe("");
  });
});

describe("describeMemberService", (): void => {
  it("reports the span from the earliest term for a sitting member", (): void => {
    const sitting: MemberProfile = profile({
      currentMember: true,
      terms: [term({ startYear: 2019 }), term({ startYear: 1975, endYear: 1981 })],
    });

    // The span, not a sum: service can be non-contiguous, and a summed total would quietly paper over a gap.
    expect(describeMemberService(sitting)).toBe("Serving since 1975");
  });

  it("reports a closed span for a former member", (): void => {
    const former: MemberProfile = profile({
      currentMember: false,
      terms: [term({ startYear: 1975, endYear: 1981 }), term({ startYear: 2019, endYear: 2023 })],
    });

    expect(describeMemberService(former)).toBe("Served 1975–2023");
  });

  it("says what it can when a former member's terms carry no end year", (): void => {
    expect(describeMemberService(profile({ currentMember: false, terms: [term({ startYear: 1975 })] }))).toBe(
      "Served from 1975",
    );
  });

  it("returns an empty string when no term carries a start year", (): void => {
    expect(describeMemberService(profile({ terms: [term()] }))).toBe("");
  });
});
