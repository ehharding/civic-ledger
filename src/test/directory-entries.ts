import type { CommitteeSummary } from "@/lib/congress/committees/model";
import type { MemberDirectoryEntry } from "@/lib/congress/members/model";

/**
 * Builders for one directory row of each kind — shared by the card, directory, and filter suites, which each used to
 * declare an identical copy. Every field a test does not care about takes a plain, valid default, so a test states only
 * the fields its assertion is about.
 */

/** One committee-directory row: a House standing committee unless `overrides` say otherwise. */
export function committee(overrides: Partial<CommitteeSummary> = {}): CommitteeSummary {
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

/** One member-directory row: a House Democrat from Ohio unless `overrides` say otherwise. */
export function memberEntry(overrides: Partial<MemberDirectoryEntry> = {}): MemberDirectoryEntry {
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
