import { describe, expect, it } from "vitest";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import {
  billDirectoryQueryString,
  matchesQuery,
  parseBillCitation,
  parseBillStageFilter,
} from "@/lib/congress/bills/search";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";

function makeBill(overrides: Partial<LegislativeBill>): LegislativeBill {
  return { ...firstPreviewBill, ...overrides };
}

describe("matchesQuery", (): void => {
  const bill: LegislativeBill = makeBill({
    congress: 119,
    type: "HR",
    number: "284",
    title: "Community Water Reliability Act",
    policyArea: "Public works and water resources",
    latestAction: { date: "2026-07-14", text: "Referred to the House Committee on Transportation." },
  });

  it("matches an empty or whitespace-only query against anything", (): void => {
    expect(matchesQuery(bill, "")).toBe(true);
    expect(matchesQuery(bill, "   ")).toBe(true);
  });

  it("matches the title case-insensitively", (): void => {
    expect(matchesQuery(bill, "water reliability")).toBe(true);
    expect(matchesQuery(bill, "WATER RELIABILITY")).toBe(true);
  });

  it("matches the bill type and number", (): void => {
    expect(matchesQuery(bill, "hr")).toBe(true);
    expect(matchesQuery(bill, "284")).toBe(true);
  });

  it("matches the policy area", (): void => {
    expect(matchesQuery(bill, "water resources")).toBe(true);
  });

  it("matches the latest action text", (): void => {
    expect(matchesQuery(bill, "transportation")).toBe(true);
  });

  it("returns false when nothing matches", (): void => {
    expect(matchesQuery(bill, "unrelated topic entirely")).toBe(false);
  });

  it("skips a bill with no policy area rather than throwing", (): void => {
    const noPolicyArea: LegislativeBill = makeBill({ policyArea: undefined });
    expect(matchesQuery(noPolicyArea, "anything")).toBe(false);
  });
});

describe("parseBillCitation", (): void => {
  it("parses a plain citation without a Congress", (): void => {
    expect(parseBillCitation("HR 284")).toEqual({ type: "HR", number: "284" });
  });

  it("parses common punctuation and spacing variants the same way", (): void => {
    expect(parseBillCitation("H.R. 284")).toEqual({ type: "HR", number: "284" });
    expect(parseBillCitation("hr284")).toEqual({ type: "HR", number: "284" });
    expect(parseBillCitation("hr.284")).toEqual({ type: "HR", number: "284" });
  });

  it("parses every bill/resolution type Congress.gov uses", (): void => {
    expect(parseBillCitation("S 917")).toEqual({ type: "S", number: "917" });
    expect(parseBillCitation("HJRES 66")).toEqual({ type: "HJRES", number: "66" });
    expect(parseBillCitation("H.J.Res. 66")).toEqual({ type: "HJRES", number: "66" });
    expect(parseBillCitation("SJRES 12")).toEqual({ type: "SJRES", number: "12" });
    expect(parseBillCitation("HCONRES 5")).toEqual({ type: "HCONRES", number: "5" });
    expect(parseBillCitation("SCONRES 5")).toEqual({ type: "SCONRES", number: "5" });
    expect(parseBillCitation("HRES 9")).toEqual({ type: "HRES", number: "9" });
    expect(parseBillCitation("SRES 9")).toEqual({ type: "SRES", number: "9" });
  });

  it("parses a leading Congress number", (): void => {
    expect(parseBillCitation("119 HR 284")).toEqual({ congress: 119, type: "HR", number: "284" });
    expect(parseBillCitation("118-hr-1219")).toEqual({ congress: 118, type: "HR", number: "1219" });
  });

  it("is case-insensitive", (): void => {
    expect(parseBillCitation("hr 284")).toEqual({ type: "HR", number: "284" });
  });

  it("returns null for free-text queries", (): void => {
    expect(parseBillCitation("water reliability act")).toBeNull();
    expect(parseBillCitation("broadband")).toBeNull();
  });

  it("returns null for an unrecognized type prefix", (): void => {
    expect(parseBillCitation("XYZ 284")).toBeNull();
  });

  it("returns null for a citation with no number", (): void => {
    expect(parseBillCitation("HR")).toBeNull();
  });

  it("returns null for an empty or whitespace-only query", (): void => {
    expect(parseBillCitation("")).toBeNull();
    expect(parseBillCitation("   ")).toBeNull();
  });
});

describe("parseBillStageFilter", (): void => {
  it("accepts each stage the control can produce", (): void => {
    expect(parseBillStageFilter("committee")).toBe("committee");
    expect(parseBillStageFilter("law")).toBe("law");
  });

  it("is case- and whitespace-insensitive, since these get hand-typed", (): void => {
    expect(parseBillStageFilter(" COMMITTEE ")).toBe("committee");
  });

  it("degrades anything unusable to the unfiltered listing rather than to an error", (): void => {
    expect(parseBillStageFilter(undefined)).toBe("all");
    expect(parseBillStageFilter(null)).toBe("all");
    expect(parseBillStageFilter("vetoed")).toBe("all");
  });
});

describe("billDirectoryQueryString", (): void => {
  it("is empty for an untouched directory, so a plain visit keeps a clean URL", (): void => {
    expect(billDirectoryQueryString("", "all")).toBe("");
  });

  it("writes only what is actually set", (): void => {
    expect(billDirectoryQueryString("broadband", "all")).toBe("?q=broadband");
    expect(billDirectoryQueryString("", "law")).toBe("?stage=law");
  });

  it("writes both in a fixed order, so the same view always produces the same link", (): void => {
    expect(billDirectoryQueryString("broadband", "law")).toBe("?q=broadband&stage=law");
  });

  it("trims the query and omits a whitespace-only one", (): void => {
    expect(billDirectoryQueryString("  broadband  ", "all")).toBe("?q=broadband");
    expect(billDirectoryQueryString("   ", "all")).toBe("");
  });

  it("round-trips through the parser it is the counterpart to", (): void => {
    const params: URLSearchParams = new URLSearchParams(billDirectoryQueryString("water", "committee"));

    expect(params.get("q")).toBe("water");
    expect(parseBillStageFilter(params.get("stage"))).toBe("committee");
  });
});
