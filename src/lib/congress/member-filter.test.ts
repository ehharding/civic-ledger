/**
 * Covers the member directory's narrowing rules: what free-text search actually matches (and the one thing it
 * deliberately doesn't), how the facets combine, and the fact that each facet's options are derived from the roster in
 * hand rather than assumed.
 */
import { describe, expect, it } from "vitest";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import {
  DEFAULT_MEMBER_DIRECTORY_QUERY,
  DEFAULT_MEMBER_SORT,
  filterMembers,
  hasActiveMemberFilters,
  type JurisdictionOption,
  listMemberJurisdictions,
  listMemberPartyOptions,
  type MemberFacetOption,
  type MemberFilters,
  matchesMemberQuery,
  memberDirectoryQueryString,
  NO_MEMBER_FILTERS,
  parseChamberFilter,
  parseJurisdictionFilter,
  parseMemberSort,
  parsePartyFilter,
  sortMembers,
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

/** The option values of a facet list, which is what most of these assertions are actually about. */
function values<Value>(options: MemberFacetOption<Value>[]): Value[] {
  return options.map((option: MemberFacetOption<Value>): Value => option.value);
}

/** The names of an ordered roster, in order. */
function names(entries: MemberDirectoryEntry[]): string[] {
  return entries.map((entry_: MemberDirectoryEntry): string => entry_.name);
}

describe("listMemberJurisdictions", (): void => {
  it("lists each jurisdiction once, alphabetically", (): void => {
    expect(values(listMemberJurisdictions(roster))).toEqual(["Alaska", "Arizona", "Northern Mariana Islands", "Ohio"]);
  });

  it("counts how many members each jurisdiction has, so a choice is predictable before it is made", (): void => {
    const ohio: JurisdictionOption | undefined = listMemberJurisdictions([
      entry(),
      entry({ bioguideId: "C000005", name: "Chen, Wei" }),
      entry({ bioguideId: "A000002", state: "Arizona" }),
    ]).find((option: JurisdictionOption): boolean => option.value === "Ohio");

    expect(ohio?.count).toBe(2);
  });

  it("groups the non-voting jurisdictions apart from the states", (): void => {
    const options: JurisdictionOption[] = listMemberJurisdictions(roster);

    function groupOf(name: string): string | undefined {
      return options.find((option: JurisdictionOption): boolean => option.value === name)?.group;
    }

    expect(groupOf("Ohio")).toBe("state");
    expect(groupOf("Alaska")).toBe("state");
    expect(groupOf("Northern Mariana Islands")).toBe("territory");
  });

  it("skips a record with no jurisdiction on file rather than offering a blank option", (): void => {
    expect(listMemberJurisdictions([entry({ state: undefined }), entry({ state: "  " })])).toEqual([]);
  });
});

describe("listMemberPartyOptions", (): void => {
  it("offers only parties that actually hold a seat", (): void => {
    expect(values(listMemberPartyOptions(roster))).not.toContain("libertarian");
  });

  it("orders parties the way the chamber diagram's legend does, not alphabetically", (): void => {
    expect(values(listMemberPartyOptions(roster))).toEqual(["democratic", "independent", "republican"]);
  });

  it("labels and counts each party, which is what makes the seating order legible", (): void => {
    expect(listMemberPartyOptions(roster)[0]).toEqual({ value: "democratic", label: "Democratic", count: 2 });
  });

  it("returns nothing for an empty roster", (): void => {
    expect(listMemberPartyOptions([])).toEqual([]);
  });
});

describe("sortMembers", (): void => {
  it("leaves the server's alphabetical order alone by default", (): void => {
    expect(names(sortMembers(roster, "name"))).toEqual([
      "Alvarez, Priya R.",
      "Bennett, Marcus T.",
      "Muñoz, Elena",
      "Sablan, Gregorio",
    ]);
  });

  it("reverses it for Z-A", (): void => {
    expect(names(sortMembers(roster, "name-desc"))).toEqual([
      "Sablan, Gregorio",
      "Muñoz, Elena",
      "Bennett, Marcus T.",
      "Alvarez, Priya R.",
    ]);
  });

  it("groups by jurisdiction, then by seat within it", (): void => {
    const delegation: MemberDirectoryEntry[] = [
      entry({ bioguideId: "A000010", name: "Adams, Nia", state: "Ohio", district: 9 }),
      entry({ bioguideId: "B000011", name: "Boyle, Sean", state: "Ohio", district: 2 }),
      entry({ bioguideId: "C000012", name: "Cruz, Maria", state: "Alaska", district: 0 }),
    ];

    expect(names(sortMembers(delegation, "state"))).toEqual(["Cruz, Maria", "Boyle, Sean", "Adams, Nia"]);
  });

  it("sorts a member with no jurisdiction last rather than first", (): void => {
    const mixed: MemberDirectoryEntry[] = [
      entry({ bioguideId: "N000013", name: "Nobody, A.", state: undefined }),
      entry({ bioguideId: "A000014", name: "Adams, Nia", state: "Ohio" }),
    ];

    expect(names(sortMembers(mixed, "state"))).toEqual(["Adams, Nia", "Nobody, A."]);
  });

  it("sorts members with no jurisdiction last regardless of which side of the comparison they land on", (): void => {
    // The previous case only ever meets the empty jurisdiction as the *second* operand. Reversing the input is what
    // exercises the other half of the same rule — a comparator that returned the wrong sign on one side only would
    // produce an order that depends on the roster's arrival order, which is exactly the bug worth catching.
    const mixed: MemberDirectoryEntry[] = [
      entry({ bioguideId: "A000014", name: "Adams, Nia", state: "Ohio" }),
      entry({ bioguideId: "N000013", name: "Nobody, A.", state: undefined }),
      entry({ bioguideId: "Z000015", name: "Zender, Kai", state: undefined }),
    ];

    expect(names(sortMembers(mixed, "state"))).toEqual(["Adams, Nia", "Nobody, A.", "Zender, Kai"]);
  });

  it("treats a seatless member of a state as at-large, so two senators sort by name", (): void => {
    // Senators carry no district. Falling back to 0 puts them where an at-large representative would go, which is the
    // seat they actually hold: the whole state.
    const senators: MemberDirectoryEntry[] = [
      entry({ bioguideId: "W000016", name: "Whitmore, Louise B.", state: "Maine", district: undefined }),
      entry({ bioguideId: "K000017", name: "King, Dana", state: "Maine", district: undefined }),
    ];

    expect(names(sortMembers(senators, "state"))).toEqual(["King, Dana", "Whitmore, Louise B."]);
  });

  it("groups by party in seating order, alphabetically within each", (): void => {
    expect(names(sortMembers(roster, "party"))).toEqual([
      "Bennett, Marcus T.",
      "Muñoz, Elena",
      "Sablan, Gregorio",
      "Alvarez, Priya R.",
    ]);
  });

  it("groups by chamber, House first", (): void => {
    expect(names(sortMembers(roster, "chamber"))).toEqual([
      "Bennett, Marcus T.",
      "Muñoz, Elena",
      "Sablan, Gregorio",
      "Alvarez, Priya R.",
    ]);
  });

  it("leaves the caller's array untouched", (): void => {
    const original: string[] = names(roster);
    sortMembers(roster, "name-desc");

    expect(names(roster)).toEqual(original);
  });
});

describe("the URL parsers", (): void => {
  it("accepts the values the controls actually produce", (): void => {
    expect(parseChamberFilter("senate")).toBe("senate");
    expect(parsePartyFilter("republican")).toBe("republican");
    expect(parseMemberSort("party")).toBe("party");
  });

  it("is case- and whitespace-insensitive, since these get hand-typed", (): void => {
    expect(parseChamberFilter(" HOUSE ")).toBe("house");
    expect(parsePartyFilter("Democratic")).toBe("democratic");
    expect(parseMemberSort("NAME-DESC")).toBe("name-desc");
  });

  it("degrades an absent or unusable param to no narrowing rather than to an error", (): void => {
    expect(parseChamberFilter(undefined)).toBe(ANY_FACET);
    expect(parseChamberFilter("lords")).toBe(ANY_FACET);
    expect(parsePartyFilter(null)).toBe(ANY_FACET);
    expect(parsePartyFilter("whig")).toBe(ANY_FACET);
    expect(parseMemberSort("seniority")).toBe(DEFAULT_MEMBER_SORT);
  });

  it("resolves a jurisdiction to the roster's own spelling of it", (): void => {
    const known: string[] = ["Ohio", "Northern Mariana Islands"];

    expect(parseJurisdictionFilter("ohio", known)).toBe("Ohio");
    expect(parseJurisdictionFilter("  NORTHERN mariana islands ", known)).toBe("Northern Mariana Islands");
  });

  it("ignores a jurisdiction the roster does not contain, rather than filtering to nothing", (): void => {
    expect(parseJurisdictionFilter("Wyoming", ["Ohio"])).toBe(ANY_FACET);
    expect(parseJurisdictionFilter("", ["Ohio"])).toBe(ANY_FACET);
  });
});

describe("memberDirectoryQueryString", (): void => {
  it("is empty for an unnarrowed directory, so a plain visit keeps a clean URL", (): void => {
    expect(memberDirectoryQueryString(DEFAULT_MEMBER_DIRECTORY_QUERY)).toBe("");
  });

  it("writes only what is actually set", (): void => {
    expect(memberDirectoryQueryString({ filters: filters({ chamber: "senate" }), sort: DEFAULT_MEMBER_SORT })).toBe(
      "?chamber=senate",
    );
  });

  it("writes every facet in a fixed order, so the same view always produces the same link", (): void => {
    const serialized: string = memberDirectoryQueryString({
      filters: filters({ query: "alvarez", chamber: "senate", party: "republican", state: "Arizona" }),
      sort: "party",
    });

    expect(serialized).toBe("?q=alvarez&chamber=senate&party=republican&state=Arizona&sort=party");
  });

  it("trims the query and omits a whitespace-only one", (): void => {
    expect(memberDirectoryQueryString({ filters: filters({ query: "  leahy  " }), sort: DEFAULT_MEMBER_SORT })).toBe(
      "?q=leahy",
    );
    expect(memberDirectoryQueryString({ filters: filters({ query: "   " }), sort: DEFAULT_MEMBER_SORT })).toBe("");
  });

  it("round-trips through the parsers it is the counterpart to", (): void => {
    const view = { filters: filters({ chamber: "house", party: "democratic", state: "Ohio" }), sort: "state" } as const;
    const params: URLSearchParams = new URLSearchParams(memberDirectoryQueryString(view));

    expect(parseChamberFilter(params.get("chamber"))).toBe(view.filters.chamber);
    expect(parsePartyFilter(params.get("party"))).toBe(view.filters.party);
    expect(parseJurisdictionFilter(params.get("state"), ["Ohio"])).toBe(view.filters.state);
    expect(parseMemberSort(params.get("sort"))).toBe(view.sort);
  });
});

describe("ANY_FACET", (): void => {
  it("is a value no real jurisdiction could collide with", (): void => {
    // The state filter passes raw jurisdiction names as option values, so the wildcard has to be distinguishable from
    // one. "all" is safe; a bare empty string would collide with a record whose state is missing.
    expect(values(listMemberJurisdictions(roster))).not.toContain(ANY_FACET);
  });
});
