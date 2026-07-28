/**
 * Covers the member directory's narrowing rules: what free-text search actually matches (and the one thing it
 * deliberately doesn't), how the facets combine, and the fact that each facet's options are derived from the roster in
 * hand rather than assumed.
 */
import { describe, expect, it } from "vitest";

import {
  ANY_FACET,
  filterMembers,
  hasActiveMemberFilters,
  listMemberParties,
  listMemberStates,
  type MemberFilters,
  matchesMemberQuery,
  NO_MEMBER_FILTERS,
} from "@/lib/congress/member-filter";
import type { MemberDirectoryEntry } from "@/lib/congress/members";

function entry(overrides: Partial<MemberDirectoryEntry> = {}): MemberDirectoryEntry {
  return {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    party: "democratic",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
    chamber: "house",
    ...overrides,
  };
}

const roster: MemberDirectoryEntry[] = [
  entry(),
  entry({ bioguideId: "A000002", name: "Alvarez, Priya R.", party: "republican", state: "Arizona", chamber: "senate" }),
  entry({
    bioguideId: "S000003",
    name: "Sablan, Gregorio",
    party: "independent",
    state: "Northern Mariana Islands",
    district: 0,
  }),
  entry({ bioguideId: "M000004", name: "Muñoz, Elena", party: "democratic", state: "Alaska", district: 0 }),
];

function filters(overrides: Partial<MemberFilters> = {}): MemberFilters {
  return { ...NO_MEMBER_FILTERS, ...overrides };
}

describe("matchesMemberQuery", (): void => {
  it("matches everything on an empty or whitespace query, so clearing the box restores the roster", (): void => {
    expect(matchesMemberQuery(entry(), "")).toBe(true);
    expect(matchesMemberQuery(entry(), "   ")).toBe(true);
  });

  it("matches on a surname, case-insensitively", (): void => {
    expect(matchesMemberQuery(entry(), "bennett")).toBe(true);
    expect(matchesMemberQuery(entry(), "BENNETT")).toBe(true);
  });

  it("matches on the jurisdiction a member represents", (): void => {
    expect(matchesMemberQuery(entry(), "ohio")).toBe(true);
  });

  it("matches the seat as it reads on screen, not just the bare state", (): void => {
    expect(matchesMemberQuery(entry(), "9th district")).toBe(true);
    expect(matchesMemberQuery(entry({ district: 0, state: "Alaska" }), "at-large")).toBe(true);
    expect(matchesMemberQuery(entry({ state: "Guam", district: 0 }), "non-voting")).toBe(true);
  });

  it("does not search party, which has its own filter beside the box", (): void => {
    // Otherwise typing "d" would return every Democrat alongside everyone whose name contains the letter.
    expect(matchesMemberQuery(entry({ partyName: "Democratic" }), "democratic")).toBe(false);
  });

  it("rejects a member who matches nothing", (): void => {
    expect(matchesMemberQuery(entry(), "wyoming")).toBe(false);
  });
});

describe("filterMembers", (): void => {
  it("returns the whole roster when nothing is filtered", (): void => {
    expect(filterMembers(roster, NO_MEMBER_FILTERS)).toHaveLength(roster.length);
  });

  it("narrows by chamber", (): void => {
    const result: MemberDirectoryEntry[] = filterMembers(roster, filters({ chamber: "senate" }));

    expect(result.map((member: MemberDirectoryEntry): string => member.name)).toEqual(["Alvarez, Priya R."]);
  });

  it("narrows by party", (): void => {
    expect(filterMembers(roster, filters({ party: "democratic" }))).toHaveLength(2);
  });

  it("narrows by jurisdiction", (): void => {
    expect(filterMembers(roster, filters({ state: "Alaska" }))).toHaveLength(1);
  });

  it("combines every facet with the search box", (): void => {
    const result: MemberDirectoryEntry[] = filterMembers(
      roster,
      filters({ chamber: "house", party: "democratic", query: "muñoz" }),
    );

    expect(result.map((member: MemberDirectoryEntry): string => member.name)).toEqual(["Muñoz, Elena"]);
  });

  it("returns nothing when the facets contradict each other, rather than falling back to a wider list", (): void => {
    expect(filterMembers(roster, filters({ chamber: "senate", state: "Ohio" }))).toEqual([]);
  });

  it("preserves the incoming order, so narrowing never also reshuffles", (): void => {
    const ordered: MemberDirectoryEntry[] = filterMembers(roster, filters({ party: "democratic" }));

    expect(ordered.map((member: MemberDirectoryEntry): string => member.name)).toEqual([
      "Bennett, Marcus T.",
      "Muñoz, Elena",
    ]);
  });
});

describe("hasActiveMemberFilters", (): void => {
  it("is false for the initial state, so no Clear control is offered with nothing to clear", (): void => {
    expect(hasActiveMemberFilters(NO_MEMBER_FILTERS)).toBe(false);
  });

  it("ignores a whitespace-only query", (): void => {
    expect(hasActiveMemberFilters(filters({ query: "   " }))).toBe(false);
  });

  it("is true once any facet is set", (): void => {
    expect(hasActiveMemberFilters(filters({ query: "leahy" }))).toBe(true);
    expect(hasActiveMemberFilters(filters({ chamber: "house" }))).toBe(true);
    expect(hasActiveMemberFilters(filters({ party: "other" }))).toBe(true);
    expect(hasActiveMemberFilters(filters({ state: "Ohio" }))).toBe(true);
  });
});

describe("listMemberStates", (): void => {
  it("lists each jurisdiction once, alphabetically", (): void => {
    expect(listMemberStates(roster)).toEqual(["Alaska", "Arizona", "Northern Mariana Islands", "Ohio"]);
  });

  it("offers territories, since their Delegates are in the roster", (): void => {
    expect(listMemberStates(roster)).toContain("Northern Mariana Islands");
  });

  it("skips a record with no jurisdiction on file rather than offering a blank option", (): void => {
    expect(listMemberStates([entry({ state: undefined }), entry({ state: "  " })])).toEqual([]);
  });
});

describe("listMemberParties", (): void => {
  it("offers only parties that actually hold a seat", (): void => {
    expect(listMemberParties(roster)).not.toContain("libertarian");
  });

  it("orders parties the way the chamber diagram's legend does, not alphabetically", (): void => {
    expect(listMemberParties(roster)).toEqual(["democratic", "independent", "republican"]);
  });

  it("returns nothing for an empty roster", (): void => {
    expect(listMemberParties([])).toEqual([]);
  });
});

describe("ANY_FACET", (): void => {
  it("is a value no real jurisdiction could collide with", (): void => {
    // The state filter passes raw jurisdiction names as option values, so the wildcard has to be distinguishable from
    // one. "all" is safe; a bare empty string would collide with a record whose state is missing.
    expect(listMemberStates(roster)).not.toContain(ANY_FACET);
  });
});
