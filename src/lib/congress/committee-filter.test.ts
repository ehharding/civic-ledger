/**
 * Covers the committee directory's narrowing rules: what free-text search matches (and the two things it deliberately
 * doesn't), how the facets combine, that the type options are derived from the list in hand, and the round trip between
 * a view and the URL that names it.
 */
import { describe, expect, it } from "vitest";

import {
  type CommitteeDirectoryQuery,
  type CommitteeFacetOption,
  type CommitteeFilters,
  committeeDirectoryQueryString,
  DEFAULT_COMMITTEE_DIRECTORY_QUERY,
  DEFAULT_COMMITTEE_SORT,
  filterCommittees,
  hasActiveCommitteeFilters,
  listCommitteeTypeOptions,
  matchesCommitteeQuery,
  NO_COMMITTEE_FILTERS,
  parseCommitteeChamberFilter,
  parseCommitteeDirectoryQuery,
  parseCommitteeSort,
  parseCommitteeTypeFilter,
  sortCommittees,
} from "@/lib/congress/committee-filter";
import type { CommitteeSummary, CommitteeType } from "@/lib/congress/committees";
import { ANY_FACET, MAX_DIRECTORY_QUERY_LENGTH } from "@/lib/congress/directory-filter";

function committee(overrides: Partial<CommitteeSummary> = {}): CommitteeSummary {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 0,
    ...overrides,
  };
}

const list: CommitteeSummary[] = [
  committee(),
  committee({ systemCode: "ssap00", name: "Appropriations Committee", chamber: "senate" }),
  committee({ systemCode: "jsec00", name: "Joint Economic Committee", chamber: "joint", type: "joint" }),
  committee({ systemCode: "hsig00", name: "Intelligence Committee", chamber: "house", type: "select" }),
];

function filters(overrides: Partial<CommitteeFilters> = {}): CommitteeFilters {
  return { ...NO_COMMITTEE_FILTERS, ...overrides };
}

describe("matchesCommitteeQuery", (): void => {
  it("matches the upstream name", (): void => {
    expect(matchesCommitteeQuery(committee(), "agriculture")).toBe(true);
  });

  /*
   * The reason both spellings are searched: a reader who pastes a referral line off a bill page types "Committee on
   * Agriculture", which does not appear anywhere in the upstream string "Agriculture Committee".
   */
  it("matches the displayed leading form as well as the upstream trailing one", (): void => {
    expect(matchesCommitteeQuery(committee(), "Committee on Agriculture")).toBe(true);
    expect(matchesCommitteeQuery(committee(), "Agriculture Committee")).toBe(true);
  });

  it("matches case-insensitively", (): void => {
    expect(matchesCommitteeQuery(committee(), "AGRICULTURE")).toBe(true);
  });

  it("matches everything on an empty or whitespace-only query", (): void => {
    expect(matchesCommitteeQuery(committee(), "")).toBe(true);
    expect(matchesCommitteeQuery(committee(), "   ")).toBe(true);
  });

  /*
   * Chamber and type each have a dedicated control beside the box. Matching them here would make typing "s" return
   * every Senate and every Standing committee alongside every name containing the letter.
   */
  it("does not match on chamber or type", (): void => {
    expect(matchesCommitteeQuery(committee(), "house")).toBe(false);
    expect(matchesCommitteeQuery(committee(), "standing")).toBe(false);
  });

  it("does not match a name it doesn't contain", (): void => {
    expect(matchesCommitteeQuery(committee(), "judiciary")).toBe(false);
  });
});

describe("filterCommittees", (): void => {
  it("returns everything when nothing is narrowed", (): void => {
    expect(filterCommittees(list, filters())).toHaveLength(list.length);
  });

  it("narrows by chamber", (): void => {
    const shown: CommitteeSummary[] = filterCommittees(list, filters({ chamber: "house" }));

    expect(shown.map((entry: CommitteeSummary): string => entry.systemCode)).toEqual(["hsag00", "hsig00"]);
  });

  it("narrows by type", (): void => {
    const shown: CommitteeSummary[] = filterCommittees(list, filters({ type: "select" }));

    expect(shown.map((entry: CommitteeSummary): string => entry.systemCode)).toEqual(["hsig00"]);
  });

  it("combines the facets with the search box", (): void => {
    expect(filterCommittees(list, filters({ chamber: "house", query: "intelligence" }))).toHaveLength(1);
    expect(filterCommittees(list, filters({ chamber: "senate", query: "intelligence" }))).toHaveLength(0);
  });

  /* Narrowing a list should never also shuffle it under the reader. */
  it("preserves the incoming order", (): void => {
    const shown: CommitteeSummary[] = filterCommittees(list, filters({ chamber: "house" }));

    expect(shown[0]?.name).toBe("Agriculture Committee");
    expect(shown[1]?.name).toBe("Intelligence Committee");
  });
});

describe("hasActiveCommitteeFilters", (): void => {
  it("is false for the untouched state", (): void => {
    expect(hasActiveCommitteeFilters(NO_COMMITTEE_FILTERS)).toBe(false);
  });

  it("is false for a whitespace-only query, which narrows nothing", (): void => {
    expect(hasActiveCommitteeFilters(filters({ query: "   " }))).toBe(false);
  });

  it("is true once any facet or the search box is set", (): void => {
    expect(hasActiveCommitteeFilters(filters({ query: "rules" }))).toBe(true);
    expect(hasActiveCommitteeFilters(filters({ chamber: "senate" }))).toBe(true);
    expect(hasActiveCommitteeFilters(filters({ type: "joint" }))).toBe(true);
  });
});

describe("sortCommittees", (): void => {
  it("leaves the server's alphabetical order alone by default", (): void => {
    const ordered: string[] = sortCommittees(list, "name").map((entry: CommitteeSummary): string => entry.name);

    expect(ordered).toEqual([
      "Agriculture Committee",
      "Appropriations Committee",
      "Intelligence Committee",
      "Joint Economic Committee",
    ]);
  });

  it("reverses for name-desc", (): void => {
    const ordered: string[] = sortCommittees(list, "name-desc").map((entry: CommitteeSummary): string => entry.name);

    expect(ordered[0]).toBe("Joint Economic Committee");
    expect(ordered.at(-1)).toBe("Agriculture Committee");
  });

  it("groups by chamber in the model's own order", (): void => {
    const ordered: string[] = sortCommittees(list, "chamber").map((entry: CommitteeSummary): string => entry.chamber);

    expect(ordered).toEqual(["house", "house", "senate", "joint"]);
  });

  it("groups by type", (): void => {
    const ordered: CommitteeType[] = sortCommittees(list, "type").map(
      (entry: CommitteeSummary): CommitteeType => entry.type,
    );

    expect(ordered).toEqual(["standing", "standing", "select", "joint"]);
  });

  /* Every comparator falls through to the name, so a group is never left in arbitrary arrival order. */
  it("orders each group alphabetically within itself", (): void => {
    const houses: string[] = sortCommittees(list, "chamber")
      .filter((entry: CommitteeSummary): boolean => entry.chamber === "house")
      .map((entry: CommitteeSummary): string => entry.name);

    expect(houses).toEqual(["Agriculture Committee", "Intelligence Committee"]);
  });

  it("does not mutate the array it was given", (): void => {
    const original: CommitteeSummary[] = [...list];
    sortCommittees(list, "name-desc");

    expect(list).toEqual(original);
  });
});

describe("listCommitteeTypeOptions", (): void => {
  it("counts each type present and omits the ones that aren't", (): void => {
    const options: CommitteeFacetOption<CommitteeType>[] = listCommitteeTypeOptions(list);

    expect(options).toEqual([
      { value: "standing", label: "Standing", count: 2 },
      { value: "select", label: "Select or Special", count: 1 },
      { value: "joint", label: "Joint", count: 1 },
    ]);
  });

  /* A control that offered a choice returning nothing would be a list you have to probe by trial and error. */
  it("offers nothing for an empty list", (): void => {
    expect(listCommitteeTypeOptions([])).toEqual([]);
  });
});

describe("the URL parsers", (): void => {
  it("reads each facet", (): void => {
    expect(parseCommitteeChamberFilter("senate")).toBe("senate");
    expect(parseCommitteeTypeFilter("joint")).toBe("joint");
    expect(parseCommitteeSort("name-desc")).toBe("name-desc");
  });

  it("matches case-insensitively and ignores whitespace", (): void => {
    expect(parseCommitteeChamberFilter("  SENATE ")).toBe("senate");
    expect(parseCommitteeTypeFilter(" Standing ")).toBe("standing");
  });

  /* Total parsers: a hand-edited, truncated, or year-old link opens the unfiltered page at worst. */
  it("degrades an absent or unrecognized value to a usable default", (): void => {
    expect(parseCommitteeChamberFilter(null)).toBe(ANY_FACET);
    expect(parseCommitteeChamberFilter("assembly")).toBe(ANY_FACET);
    expect(parseCommitteeTypeFilter(undefined)).toBe(ANY_FACET);
    expect(parseCommitteeTypeFilter("subcommittee")).toBe(ANY_FACET);
    expect(parseCommitteeSort("by-size")).toBe(DEFAULT_COMMITTEE_SORT);
  });
});

describe("parseCommitteeDirectoryQuery", (): void => {
  it("reads a whole view out of a query string", (): void => {
    const view: CommitteeDirectoryQuery = parseCommitteeDirectoryQuery(
      new URLSearchParams("q=rules&chamber=house&type=standing&sort=name-desc"),
    );

    expect(view).toEqual({
      filters: { query: "rules", chamber: "house", type: "standing" },
      sort: "name-desc",
    });
  });

  it("reads a bare URL as the default view", (): void => {
    expect(parseCommitteeDirectoryQuery(new URLSearchParams(""))).toEqual(DEFAULT_COMMITTEE_DIRECTORY_QUERY);
  });

  it("trims and caps the free-text query", (): void => {
    const long: string = "a".repeat(MAX_DIRECTORY_QUERY_LENGTH + 50);
    const view: CommitteeDirectoryQuery = parseCommitteeDirectoryQuery(new URLSearchParams(`q=${long}`));

    expect(view.filters.query).toHaveLength(MAX_DIRECTORY_QUERY_LENGTH);
    expect(parseCommitteeDirectoryQuery(new URLSearchParams("q=%20%20rules%20%20")).filters.query).toBe("rules");
  });
});

describe("committeeDirectoryQueryString", (): void => {
  it("writes nothing for an unnarrowed directory in its default order", (): void => {
    expect(committeeDirectoryQueryString(DEFAULT_COMMITTEE_DIRECTORY_QUERY)).toBe("");
  });

  it("writes only the values that aren't defaults, in a fixed order", (): void => {
    expect(
      committeeDirectoryQueryString({
        filters: { query: "rules", chamber: "house", type: "standing" },
        sort: "name-desc",
      }),
    ).toBe("?q=rules&chamber=house&type=standing&sort=name-desc");
  });

  it("omits a whitespace-only query", (): void => {
    expect(committeeDirectoryQueryString({ filters: filters({ query: "   " }), sort: DEFAULT_COMMITTEE_SORT })).toBe(
      "",
    );
  });

  /*
   * The property that makes these links work at all: the route parses an incoming URL and the browser writes one back,
   * so a view that doesn't survive the round trip is a link that silently restores something else.
   */
  it("round-trips every view back to itself", (): void => {
    const views: CommitteeDirectoryQuery[] = [
      DEFAULT_COMMITTEE_DIRECTORY_QUERY,
      { filters: filters({ chamber: "joint" }), sort: "type" },
      { filters: filters({ query: "armed services", type: "standing" }), sort: "name-desc" },
      { filters: { query: "rules", chamber: "senate", type: "select" }, sort: "chamber" },
    ];

    for (const view of views) {
      const serialized: string = committeeDirectoryQueryString(view);
      expect(parseCommitteeDirectoryQuery(new URLSearchParams(serialized))).toEqual(view);
    }
  });
});
