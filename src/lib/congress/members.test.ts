/**
 * Covers members.ts's normalization and display logic: the party/chamber narrowing that absorbs Congress.gov's
 * inconsistent free-text labels, the derivation of non-voting House seats from the represented jurisdiction, and the
 * exact wording of the seat descriptions the chart uses as accessible names.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bioguideUrl,
  buildChamberComposition,
  type ChamberComposition,
  type CongressMember,
  describeChamberSeats,
  formatMemberParty,
  formatMemberSeat,
  formatMemberSummary,
  formatSeatShare,
  isNonVotingJurisdiction,
  normalizeChamberName,
  normalizeJurisdiction,
  normalizePartyName,
  type PartyGroup,
  type PartyTally,
  partyGroups,
  partySeatingOrder,
  partySeatingRank,
  partyTintClass,
  tallyPartyCounts,
} from "@/lib/congress/members";

function member(overrides: Partial<CongressMember> = {}): CongressMember {
  return { name: "Doe, Jane", party: "democratic", ...overrides };
}

describe("normalizePartyName", (): void => {
  it("narrows every party label the API documents", (): void => {
    expect(normalizePartyName("Democratic")).toBe("democratic");
    expect(normalizePartyName("Republican")).toBe("republican");
    expect(normalizePartyName("Independent")).toBe("independent");
    expect(normalizePartyName("Libertarian")).toBe("libertarian");
  });

  it("groups Independent Democrats as independent rather than democratic", (): void => {
    // The label starts with "Independent", so the independent branch has to be checked first.
    expect(normalizePartyName("Independent Democrat")).toBe("independent");
  });

  it("absorbs the spelling variants the API's own documentation contains", (): void => {
    // "Democrat" (member endpoint) vs. "Democratic" (bill endpoint), and the documented "Republication" typo.
    expect(normalizePartyName("Democrat")).toBe("democratic");
    expect(normalizePartyName("Republication")).toBe("republican");
  });

  it("ignores surrounding whitespace and casing", (): void => {
    expect(normalizePartyName("  rePUBlican  ")).toBe("republican");
  });

  it("falls back to 'other' for missing or unrecognized labels", (): void => {
    expect(normalizePartyName(undefined)).toBe("other");
    expect(normalizePartyName("")).toBe("other");
    expect(normalizePartyName("Whig")).toBe("other");
  });
});

describe("normalizeChamberName", (): void => {
  it("narrows the two values the API returns", (): void => {
    expect(normalizeChamberName("House of Representatives")).toBe("house");
    expect(normalizeChamberName("Senate")).toBe("senate");
  });

  it("returns null for anything unrecognized, so the record can be dropped rather than misfiled", (): void => {
    expect(normalizeChamberName(undefined)).toBeNull();
    expect(normalizeChamberName("Assembly")).toBeNull();
  });
});

describe("isNonVotingJurisdiction", (): void => {
  it("recognizes all six non-voting House jurisdictions", (): void => {
    for (const state of [
      "American Samoa",
      "District of Columbia",
      "Guam",
      "Northern Mariana Islands",
      "Puerto Rico",
      "Virgin Islands",
    ]) {
      expect(isNonVotingJurisdiction(state)).toBe(true);
    }
  });

  it("recognizes the longer spellings the upstream field sometimes uses", (): void => {
    expect(isNonVotingJurisdiction("U.S. Virgin Islands")).toBe(true);
    expect(isNonVotingJurisdiction("Commonwealth of the Northern Mariana Islands")).toBe(true);
  });

  it("does not flag states, including ones with a single at-large seat", (): void => {
    expect(isNonVotingJurisdiction("Vermont")).toBe(false);
    expect(isNonVotingJurisdiction("Alaska")).toBe(false);
    expect(isNonVotingJurisdiction(undefined)).toBe(false);
  });
});

describe("partySeatingRank", (): void => {
  it("places the two major parties at opposite ends with everyone else between them", (): void => {
    expect(partySeatingRank("democratic")).toBeLessThan(partySeatingRank("independent"));
    expect(partySeatingRank("independent")).toBeLessThan(partySeatingRank("republican"));
  });

  it("sorts an unlisted party last rather than throwing", (): void => {
    expect(partySeatingRank("nonexistent" as PartyGroup)).toBe(partySeatingOrder.length);
  });
});

describe("partyTintClass", (): void => {
  it("names the class for a group", (): void => {
    expect(partyTintClass("democratic")).toBe("party-tint--democratic");
  });

  /*
   * The point of the tint class is that party.css is the *only* place the five-way party-to-color mapping is written
   * down, which is only true while that file actually covers every group. A party added to `partyGroups` without its
   * rule would render in the neutral fallback gray everywhere it appears — on a chamber seat, in the legend, and on
   * the member's own page — which reads as a real (wrong) answer rather than as a missing one. Reading the stylesheet
   * is the only way to catch that from a unit test, so this reads it.
   */
  it("has a rule in party.css for every party group", (): void => {
    const stylesheet: string = readFileSync(join(process.cwd(), "src/styles/party.css"), "utf8");

    for (const group of partyGroups) {
      expect(stylesheet).toContain(`.${partyTintClass(group)} {`);
    }
  });
});

describe("tallyPartyCounts", (): void => {
  it("counts by party in seating order and omits parties holding no seats", (): void => {
    const tallies: PartyTally[] = tallyPartyCounts([
      member({ party: "republican" }),
      member({ party: "democratic" }),
      member({ party: "republican" }),
      member({ party: "independent" }),
    ]);

    expect(tallies).toEqual([
      { party: "democratic", count: 1 },
      { party: "independent", count: 1 },
      { party: "republican", count: 2 },
    ]);
  });

  it("returns nothing for an empty chamber", (): void => {
    expect(tallyPartyCounts([])).toEqual([]);
  });
});

describe("buildChamberComposition", (): void => {
  it("splits House seats into voting and non-voting", (): void => {
    const composition: ChamberComposition = buildChamberComposition("house", [
      member({ state: "Ohio", district: 9 }),
      member({ state: "District of Columbia", district: 0 }),
      member({ state: "Puerto Rico", district: 0 }),
    ]);

    expect(composition.members).toHaveLength(3);
    expect(composition.votingSeats).toBe(1);
    expect(composition.nonVotingSeats).toBe(2);
  });

  it("treats every Senate seat as voting, even for a member from a non-voting House jurisdiction's name", (): void => {
    const composition: ChamberComposition = buildChamberComposition("senate", [
      member({ state: "Vermont" }),
      member({ state: "Arizona" }),
    ]);

    expect(composition.votingSeats).toBe(2);
    expect(composition.nonVotingSeats).toBe(0);
  });
});

describe("formatMemberSeat", (): void => {
  it("names just the state for a senator", (): void => {
    expect(formatMemberSeat(member({ state: "Vermont" }), "senate")).toBe("Vermont");
  });

  it("names the ordinal district for a representative", (): void => {
    expect(formatMemberSeat(member({ state: "Ohio", district: 9 }), "house")).toBe("Ohio's 9th district");
    expect(formatMemberSeat(member({ state: "Texas", district: 22 }), "house")).toBe("Texas's 22nd district");
  });

  it("reads district 0 as at-large, since that's what the API uses for single-seat states", (): void => {
    expect(formatMemberSeat(member({ state: "Alaska", district: 0 }), "house")).toBe("Alaska at-large");
    expect(formatMemberSeat(member({ state: "Wyoming" }), "house")).toBe("Wyoming at-large");
  });

  it("marks the House seats that carry no floor vote", (): void => {
    expect(formatMemberSeat(member({ state: "Guam", district: 0 }), "house")).toBe("Guam (non-voting seat)");
  });

  it("returns an empty string when there's no jurisdiction to name", (): void => {
    expect(formatMemberSeat(member(), "house")).toBe("");
    expect(formatMemberSeat(member({ state: "   " }), "senate")).toBe("");
  });
});

describe("formatMemberParty", (): void => {
  it("prefers the upstream label so a nuance like Independent Democrat survives", (): void => {
    expect(formatMemberParty(member({ party: "independent", partyName: "Independent Democrat" }))).toBe(
      "Independent Democrat",
    );
  });

  it("falls back to the group's own label when the record has none", (): void => {
    expect(formatMemberParty(member({ party: "republican" }))).toBe("Republican");
    expect(formatMemberParty(member({ party: "republican", partyName: "  " }))).toBe("Republican");
  });
});

describe("formatMemberSummary", (): void => {
  it("reads as a full one-line description of the seat", (): void => {
    expect(
      formatMemberSummary(member({ name: "Leahy, Patrick J.", partyName: "Democratic", state: "Vermont" }), "senate"),
    ).toBe("Leahy, Patrick J., Democratic, Vermont");
  });

  it("omits the jurisdiction clause entirely when there isn't one", (): void => {
    expect(formatMemberSummary(member({ name: "Preview Seat 1" }), "house")).toBe("Preview Seat 1, Democratic");
  });
});

describe("bioguideUrl", (): void => {
  it("points at the Biographical Directory entry for the ID", (): void => {
    expect(bioguideUrl("L000174")).toBe("https://bioguide.congress.gov/search/bio/L000174");
  });
});

describe("formatSeatShare", (): void => {
  it("reports a share to one decimal place", (): void => {
    expect(formatSeatShare(220, 441)).toBe("49.9%");
    expect(formatSeatShare(1, 2)).toBe("50.0%");
  });

  it("does not divide by zero on an empty chamber", (): void => {
    expect(formatSeatShare(0, 0)).toBe("0%");
  });
});

describe("describeChamberSeats", (): void => {
  const voting: CongressMember = { name: "Bennett, Marcus T.", party: "democratic", state: "Ohio", district: 9 };
  const alsoVoting: CongressMember = { name: "Alvarez, Priya R.", party: "republican", state: "Arizona" };
  const delegate: CongressMember = { name: "Norton, Eleanor", party: "democratic", state: "District of Columbia" };

  it("splits out non-voting seats when a chamber has them", (): void => {
    expect(describeChamberSeats(buildChamberComposition("house", [voting, alsoVoting, delegate]))).toBe(
      "3 seats — 2 voting, 1 non-voting",
    );
  });

  it("reports a plain seat count when every seat votes", (): void => {
    expect(describeChamberSeats(buildChamberComposition("senate", [voting, alsoVoting]))).toBe("2 seats");
  });

  it("uses the singular for a lone seat", (): void => {
    expect(describeChamberSeats(buildChamberComposition("senate", [voting]))).toBe("1 seat");
  });
});

describe("normalizeJurisdiction", (): void => {
  it("gives one canonical spelling to a name however it arrives", (): void => {
    // The point is not tidiness: this value is the member directory's filter key, so two spellings of one state would
    // split a delegation into two options that each return half of it.
    expect(normalizeJurisdiction("OHIO")).toBe("Ohio");
    expect(normalizeJurisdiction("ohio")).toBe("Ohio");
    expect(normalizeJurisdiction(" Ohio ")).toBe("Ohio");
  });

  it("reads the multi-word jurisdictions the way Congress.gov prints them", (): void => {
    expect(normalizeJurisdiction("DISTRICT OF COLUMBIA")).toBe("District of Columbia");
    expect(normalizeJurisdiction("northern mariana islands")).toBe("Northern Mariana Islands");
  });

  it("treats an absent or blank jurisdiction as absent, not as a blank option", (): void => {
    expect(normalizeJurisdiction(undefined)).toBeUndefined();
    expect(normalizeJurisdiction("   ")).toBeUndefined();
  });

  it("still reads as a non-voting jurisdiction once normalized", (): void => {
    // isNonVotingJurisdiction lowercases anyway, but these two have to agree for the House's seat split to stay right.
    expect(isNonVotingJurisdiction(normalizeJurisdiction("PUERTO RICO"))).toBe(true);
    expect(isNonVotingJurisdiction(normalizeJurisdiction("OHIO"))).toBe(false);
  });
});
