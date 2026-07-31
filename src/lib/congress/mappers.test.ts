/**
 * Covers the upstream-to-internal translation layer directly.
 *
 * Every mapper here follows one contract — return `null` when a record is missing something the app genuinely depends
 * on — and that contract is only worth anything if the *narrowness* of "genuinely depends on" holds: a bill with no
 * policy area is fine, a bill with no title is not. These tests exercise both halves of every such decision, because
 * the failure mode either way is invisible at a glance. Too strict and real records silently vanish from a directory;
 * too loose and a card renders with a blank heading.
 *
 * The fallbacks matter for the same reason. Congress.gov spells the same field differently across its list and detail
 * endpoints, reports party only as a history, and omits the chamber from a committee item record entirely — so several
 * of the branches below are the mappers reconciling a payload that is internally inconsistent by design. They are
 * reachable only from a shape a healthy request rarely produces, which is exactly why they need a test rather than a
 * hope.
 */
import { describe, expect, it } from "vitest";

import type {
  CongressApiBill,
  CongressApiCommittee,
  CongressApiCommitteeDetail,
  CongressApiMember,
  CongressApiMemberDetail,
} from "@/lib/congress/api-schema";
import type { CommitteeProfile, CommitteeSummary } from "@/lib/congress/committees";
import {
  asOriginChamber,
  mapCommitteeHistory,
  mapCommitteeProfile,
  mapCommitteeRef,
  mapCongressBill,
  mapCongressCommittee,
  mapCongressMember,
  mapCongressSummary,
  mapCongressTextVersion,
  mapLeadershipRole,
  mapMemberProfile,
  mapMemberTerm,
  mapUsable,
  type SeatedMember,
  sortByDateDesc,
} from "@/lib/congress/mappers";
import type { MemberProfile } from "@/lib/congress/members";
import type { BillSummary, BillTextVersion, LegislativeBill } from "@/lib/congress/types";

/** A complete list-endpoint bill, which individual cases then take fields away from. */
function apiBill(overrides: Partial<CongressApiBill> = {}): CongressApiBill {
  return {
    congress: 119,
    type: "hr",
    number: "284",
    title: "Community Water Reliability Act",
    originChamber: "House",
    introducedDate: "2026-07-08",
    latestAction: { actionDate: "2026-07-14", text: "Referred to the House Committee on Public Works." },
    ...overrides,
  } as CongressApiBill;
}

describe("asOriginChamber", (): void => {
  it("passes through the two chambers the model recognizes", (): void => {
    expect(asOriginChamber("House")).toBe("House");
    expect(asOriginChamber("Senate")).toBe("Senate");
  });

  it("reports anything else as Unknown rather than guessing", (): void => {
    expect(asOriginChamber(undefined)).toBe("Unknown");
    expect(asOriginChamber("")).toBe("Unknown");
    expect(asOriginChamber("house")).toBe("Unknown");
    expect(asOriginChamber("Joint")).toBe("Unknown");
  });
});

describe("mapCongressBill", (): void => {
  it("maps a complete list-endpoint record", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(apiBill());

    expect(bill).toMatchObject({
      congress: 119,
      type: "HR",
      number: "284",
      title: "Community Water Reliability Act",
      originChamber: "House",
    });
  });

  it("accepts the detail endpoint's spelling of the identifier", (): void => {
    // The list endpoint says `type`/`number`; the item endpoint says `billType`/`billNumber`. One mapper covers both,
    // which is what keeps a single definition of "a complete record".
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ type: undefined, number: undefined, billType: "s", billNumber: 917 }),
    );

    expect(bill?.type).toBe("S");
    expect(bill?.number).toBe("917");
  });

  it("returns null for a record missing anything the app depends on", (): void => {
    expect(mapCongressBill(apiBill({ congress: undefined }))).toBeNull();
    expect(mapCongressBill(apiBill({ title: undefined }))).toBeNull();
    expect(mapCongressBill(apiBill({ type: undefined, billType: undefined }))).toBeNull();
    expect(mapCongressBill(apiBill({ number: undefined, billNumber: undefined }))).toBeNull();
  });

  it("keeps a record that is merely sparse, which is a different thing from incomplete", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ policyArea: undefined, sponsors: undefined, cosponsors: undefined, introducedDate: undefined }),
    );

    expect(bill).not.toBeNull();
    expect(bill?.policyArea).toBeUndefined();
    expect(bill?.sponsor).toBeUndefined();
    expect(bill?.cosponsorCount).toBeUndefined();
  });

  it("says so plainly when no action text has been published", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(apiBill({ latestAction: undefined }));

    expect(bill?.latestAction.text).toBe("No action text has been published yet.");
  });

  it("falls back to the record's update date when the latest action carries no date of its own", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ latestAction: { text: "Introduced in House." }, updateDate: "2026-07-11" }),
    );

    expect(bill?.latestAction.date).toBe("2026-07-11");
  });

  it("keeps a sponsor only when it carries a name to print", (): void => {
    const named: LegislativeBill | null = mapCongressBill(
      apiBill({ sponsors: [{ fullName: "Rep. Bennett, Marcus T. [D-OH-9]", party: "D", state: "OH" }] }),
    );
    const anonymous: LegislativeBill | null = mapCongressBill(apiBill({ sponsors: [{ party: "D" }] }));

    expect(named?.sponsor?.fullName).toBe("Rep. Bennett, Marcus T. [D-OH-9]");
    expect(anonymous?.sponsor).toBeUndefined();
  });

  it("links to the public Congress.gov page rather than the record's own API endpoint", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ url: "https://api.congress.gov/v3/bill/119/hr/284" }),
    );

    // `bill.url` serves JSON, and 403s without a key of the reader's own.
    expect(bill?.officialUrl).not.toContain("api.congress.gov");
    expect(bill?.officialUrl).toContain("congress.gov");
  });
});

describe("mapCongressSummary", (): void => {
  it("maps a complete summary and sanitizes its HTML on the way through", (): void => {
    const summary: BillSummary | null = mapCongressSummary({
      versionCode: "17",
      actionDesc: "Introduced in House",
      actionDate: "2026-07-08",
      text: "<p>Directs the EPA to act.</p><script>alert(1)</script>",
    });

    expect(summary?.actionDesc).toBe("Introduced in House");
    // No unsanitized markup ever exists inside the app's own model.
    expect(summary?.html).not.toContain("<script>");
    expect(summary?.html).toContain("<p>");
  });

  it("returns null without text or without an action description", (): void => {
    expect(mapCongressSummary({ actionDesc: "Introduced in House" })).toBeNull();
    expect(mapCongressSummary({ text: "<p>Body</p>" })).toBeNull();
  });

  it("falls back to a placeholder version code, since the code is a label rather than an identifier", (): void => {
    const summary: BillSummary | null = mapCongressSummary({ actionDesc: "Introduced in House", text: "<p>x</p>" });

    expect(summary?.versionCode).toBe("00");
  });
});

describe("mapCongressTextVersion", (): void => {
  it("maps a version and keeps only formats carrying both a label and a URL", (): void => {
    const version: BillTextVersion | null = mapCongressTextVersion({
      type: "Introduced in House",
      date: "2026-07-08",
      formats: [
        { type: "PDF", url: "https://www.congress.gov/119/bills/hr284/BILLS-119hr284ih.pdf" },
        { type: "XML" },
        { url: "https://www.congress.gov/orphan" },
      ],
    });

    expect(version?.formats).toHaveLength(1);
    expect(version?.formats[0]?.type).toBe("PDF");
  });

  it("returns null with no type, or with no linkable format left", (): void => {
    // A version with nothing to link to is a heading with no content behind it.
    expect(mapCongressTextVersion({ formats: [{ type: "PDF", url: "https://example.test/a.pdf" }] })).toBeNull();
    expect(mapCongressTextVersion({ type: "Introduced in House", formats: [] })).toBeNull();
    expect(mapCongressTextVersion({ type: "Introduced in House" })).toBeNull();
    expect(mapCongressTextVersion({ type: "Introduced in House", formats: [{ type: "XML" }] })).toBeNull();
  });
});

describe("mapCongressMember", (): void => {
  it("seats a member in the chamber of their most recent recognizable term", (): void => {
    // A member who moved from the House to the Senate belongs in the Senate.
    const seated: SeatedMember | null = mapCongressMember({
      name: "Alvarez, Priya R.",
      terms: { item: [{ chamber: "House of Representatives" }, { chamber: "Senate" }] },
    } as CongressApiMember);

    expect(seated?.chamber).toBe("senate");
  });

  it("keeps the last recognizable chamber when a later term names none", (): void => {
    const seated: SeatedMember | null = mapCongressMember({
      name: "Bennett, Marcus T.",
      terms: { item: [{ chamber: "House of Representatives" }, { chamber: "Committee of the Whole" }] },
    } as CongressApiMember);

    expect(seated?.chamber).toBe("house");
  });

  it("returns null with no name, or with no recognizable chamber at all", (): void => {
    // Either way there is no defensible seat to draw.
    expect(mapCongressMember({ terms: { item: [{ chamber: "Senate" }] } } as CongressApiMember)).toBeNull();
    expect(
      mapCongressMember({ name: "   ", terms: { item: [{ chamber: "Senate" }] } } as CongressApiMember),
    ).toBeNull();
    expect(mapCongressMember({ name: "Nobody, A." } as CongressApiMember)).toBeNull();
    expect(mapCongressMember({ name: "Nobody, A.", terms: { item: [] } } as CongressApiMember)).toBeNull();
  });
});

describe("mapMemberTerm", (): void => {
  it("maps a term and normalizes its jurisdiction", (): void => {
    expect(mapMemberTerm({ chamber: "Senate", congress: 119, startYear: 2025, stateName: "ARIZONA" })).toMatchObject({
      chamber: "senate",
      congress: 119,
      state: "Arizona",
    });
  });

  it("returns null for a term naming no recognizable chamber", (): void => {
    // A term that names no chamber can't be placed in a service history, and dropping it beats a blank row.
    expect(mapMemberTerm({ chamber: "Continental Congress", startYear: 1776 })).toBeNull();
    expect(mapMemberTerm({ startYear: 2025 })).toBeNull();
  });
});

describe("mapMemberProfile", (): void => {
  /** A complete item-endpoint member record. */
  function apiMember(overrides: Partial<CongressApiMemberDetail> = {}): CongressApiMemberDetail {
    return {
      bioguideId: "b000001",
      invertedOrderName: "Bennett, Marcus T.",
      directOrderName: "Marcus T. Bennett",
      partyName: "Democratic",
      state: "Ohio",
      district: 9,
      currentMember: true,
      terms: [{ chamber: "House of Representatives", congress: 119, startYear: 2025, stateName: "Ohio", district: 9 }],
      ...overrides,
    } as CongressApiMemberDetail;
  }

  it("maps a complete record, upper-casing the ID every other surface keys on", (): void => {
    const profile: MemberProfile | null = mapMemberProfile(apiMember(), "B000001");

    expect(profile).toMatchObject({ bioguideId: "B000001", name: "Bennett, Marcus T.", chamber: "house" });
  });

  it("falls back to the looked-up ID when the payload omits one", (): void => {
    expect(mapMemberProfile(apiMember({ bioguideId: undefined }), "b000001")?.bioguideId).toBe("B000001");
  });

  it("falls back to the direct-order name when the inverted one is absent", (): void => {
    const profile: MemberProfile | null = mapMemberProfile(apiMember({ invertedOrderName: undefined }), "B000001");

    expect(profile?.name).toBe("Marcus T. Bennett");
  });

  it("returns null with no name at all, or with no usable term", (): void => {
    // Without a chamber there is no way to describe the seat; without a name there is nothing to title the page with.
    expect(mapMemberProfile(apiMember({ invertedOrderName: undefined, directOrderName: undefined }), "B1")).toBeNull();
    expect(mapMemberProfile(apiMember({ invertedOrderName: "  ", directOrderName: "  " }), "B1")).toBeNull();
    expect(mapMemberProfile(apiMember({ terms: [] }), "B1")).toBeNull();
    expect(mapMemberProfile(apiMember({ terms: [{ chamber: "Continental Congress" }] }), "B1")).toBeNull();
    // The wrapped shape present but carrying no `item` array — neither an array nor a populated wrapper.
    expect(mapMemberProfile(apiMember({ terms: {} }), "B1")).toBeNull();
  });

  it("accepts terms in either the array or the wrapped-item shape the API uses", (): void => {
    const wrapped: MemberProfile | null = mapMemberProfile(
      apiMember({ terms: { item: [{ chamber: "Senate", congress: 119, startYear: 2025 }] } }),
      "B000001",
    );

    expect(wrapped?.chamber).toBe("senate");
  });

  it("orders terms newest first, so the current seat is the one described", (): void => {
    const profile: MemberProfile | null = mapMemberProfile(
      apiMember({
        terms: [
          { chamber: "House of Representatives", congress: 117, startYear: 2021 },
          { chamber: "Senate", congress: 119, startYear: 2025 },
        ],
      }),
      "B000001",
    );

    expect(profile?.chamber).toBe("senate");
    expect(profile?.terms.map((term): number | undefined => term.startYear)).toEqual([2025, 2021]);
  });

  it("reads the party from the history's most recent entry when no top-level name is given", (): void => {
    // The API reports party only as a history; the last entry is the one describing them now.
    const profile: MemberProfile | null = mapMemberProfile(
      apiMember({
        partyName: undefined,
        partyHistory: [{ partyName: "Independent" }, { partyName: "Republican" }],
      }),
      "B000001",
    );

    expect(profile?.partyName).toBe("Republican");
    expect(profile?.party).toBe("republican");
  });

  it("fills the jurisdiction and district in from the most recent term when the record omits them", (): void => {
    const profile: MemberProfile | null = mapMemberProfile(
      apiMember({
        state: undefined,
        district: undefined,
        terms: [{ chamber: "House of Representatives", startYear: 2025, stateName: "Georgia", district: 4 }],
      }),
      "B000001",
    );

    expect(profile?.state).toBe("Georgia");
    expect(profile?.district).toBe(4);
  });

  it("treats an absent currentMember flag as false, which is what the API means by omitting it", (): void => {
    expect(mapMemberProfile(apiMember({ currentMember: undefined }), "B000001")?.currentMember).toBe(false);
  });

  it("carries a portrait only when there is an image, sanitizing its credit line", (): void => {
    const withCredit: MemberProfile | null = mapMemberProfile(
      apiMember({
        depiction: {
          imageUrl: "https://www.congress.gov/img/member/b000001.jpg",
          attribution: '<a href="https://www.loc.gov/">Library of Congress</a><script>alert(1)</script>',
        },
      }),
      "B000001",
    );
    const withoutImage: MemberProfile | null = mapMemberProfile(
      apiMember({ depiction: { attribution: "Collection of the U.S. House" } }),
      "B000001",
    );
    const withoutCredit: MemberProfile | null = mapMemberProfile(
      apiMember({ depiction: { imageUrl: "https://www.congress.gov/img/member/b000001.jpg" } }),
      "B000001",
    );

    expect(withCredit?.depiction?.attribution).not.toContain("<script>");
    expect(withCredit?.depiction?.attribution).toContain("Library of Congress");
    // An attribution with no image behind it has nothing to attribute.
    expect(withoutImage?.depiction).toBeUndefined();
    expect(withoutCredit?.depiction?.attribution).toBeUndefined();
  });

  it("drops leadership entries that name no office", (): void => {
    const profile: MemberProfile | null = mapMemberProfile(
      apiMember({ leadership: [{ type: "Majority Leader", congress: 119 }, { congress: 118 }, { type: "  " }] }),
      "B000001",
    );

    expect(profile?.leadership).toEqual([{ type: "Majority Leader", congress: 119 }]);
  });
});

describe("mapLeadershipRole", (): void => {
  it("maps a named office", (): void => {
    expect(mapLeadershipRole({ type: "Speaker of the House", congress: 119 })).toEqual({
      type: "Speaker of the House",
      congress: 119,
    });
  });

  it("returns null when it names no office, since a congress number alone says nothing", (): void => {
    expect(mapLeadershipRole({ congress: 119 })).toBeNull();
    expect(mapLeadershipRole({ type: "   ", congress: 119 })).toBeNull();
  });
});

describe("mapCommitteeRef", (): void => {
  it("maps a reference, lower-casing the code the route carries", (): void => {
    expect(mapCommitteeRef({ systemCode: "HSPW00", name: "Committee on Public Works" })).toEqual({
      systemCode: "hspw00",
      name: "Committee on Public Works",
    });
  });

  it("returns null without a code or without a name", (): void => {
    // A subcommittee with no code cannot be opened; one with no name cannot be labeled.
    expect(mapCommitteeRef({ name: "Committee on Public Works" })).toBeNull();
    expect(mapCommitteeRef({ systemCode: "hspw00" })).toBeNull();
    expect(mapCommitteeRef({ systemCode: "  ", name: "  " })).toBeNull();
  });
});

describe("mapCongressCommittee", (): void => {
  /** A complete committee-list entry. */
  function apiCommittee(overrides: Partial<CongressApiCommittee> = {}): CongressApiCommittee {
    return {
      systemCode: "HSPW00",
      name: "Committee on Public Works",
      chamber: "House",
      committeeTypeCode: "Standing",
      ...overrides,
    } as CongressApiCommittee;
  }

  it("maps a complete list entry", (): void => {
    const committee: CommitteeSummary | null = mapCongressCommittee(apiCommittee());

    expect(committee).toMatchObject({ systemCode: "hspw00", chamber: "house", type: "standing" });
  });

  it("returns null without a code, a name, or a recognizable chamber", (): void => {
    expect(mapCongressCommittee(apiCommittee({ systemCode: undefined }))).toBeNull();
    expect(mapCongressCommittee(apiCommittee({ name: undefined }))).toBeNull();
    expect(mapCongressCommittee(apiCommittee({ name: "  " }))).toBeNull();
    // The chamber check is what drops the API's "NoChamber" records, which are committees of neither body.
    expect(mapCongressCommittee(apiCommittee({ chamber: "NoChamber" }))).toBeNull();
  });

  it("falls back to the type field when no type code is given", (): void => {
    const committee: CommitteeSummary | null = mapCongressCommittee(
      apiCommittee({ committeeTypeCode: undefined, type: "Select" }),
    );

    expect(committee?.typeName).toBe("Select");
    expect(committee?.type).toBe("select");
  });

  it("carries a parent only when the reference is usable, and counts usable subcommittees", (): void => {
    const withParent: CommitteeSummary | null = mapCongressCommittee(
      apiCommittee({
        parent: { systemCode: "HSPW00", name: "Committee on Public Works" },
        subcommittees: [{ systemCode: "hspw01", name: "Bridges" }, { name: "Nameless code" }],
      }),
    );
    const brokenParent: CommitteeSummary | null = mapCongressCommittee(apiCommittee({ parent: { name: "No code" } }));

    expect(withParent?.parent?.systemCode).toBe("hspw00");
    expect(withParent?.subcommitteeCount).toBe(1);
    expect(brokenParent?.parent).toBeUndefined();
    expect(brokenParent?.subcommitteeCount).toBe(0);
  });
});

describe("mapCommitteeHistory", (): void => {
  it("prefers the official name and carries the library name only when it adds something", (): void => {
    const both = mapCommitteeHistory({
      officialName: "Committee on Public Works",
      libraryOfCongressName: "Public Works",
      startDate: "2015-01-06T00:00:00Z",
    });
    const identical = mapCommitteeHistory({
      officialName: "Committee on Public Works",
      libraryOfCongressName: "Committee on Public Works",
    });

    expect(both).toMatchObject({ name: "Committee on Public Works", libraryName: "Public Works" });
    // Otherwise the page would print one string twice.
    expect(identical?.libraryName).toBeUndefined();
  });

  it("falls back to the library name when there is no official one", (): void => {
    const entry = mapCommitteeHistory({ libraryOfCongressName: "Public Works" });

    expect(entry?.name).toBe("Public Works");
    expect(entry?.libraryName).toBeUndefined();
  });

  it("returns null when the span carries no name at all", (): void => {
    // A span with no name on it says only that time passed.
    expect(mapCommitteeHistory({ startDate: "2015-01-06T00:00:00Z" })).toBeNull();
    expect(mapCommitteeHistory({ officialName: "  ", libraryOfCongressName: "  " })).toBeNull();
  });
});

describe("mapCommitteeProfile", (): void => {
  /** A complete committee item record. The item endpoint carries no `name` and no `chamber` of its own. */
  function apiCommitteeDetail(overrides: Partial<CongressApiCommitteeDetail> = {}): CongressApiCommitteeDetail {
    return {
      systemCode: "HSPW00",
      type: "Standing",
      isCurrent: true,
      history: [
        { officialName: "Committee on Public Works", startDate: "2015-01-06T00:00:00Z" },
        { officialName: "Committee on Roads and Waterways", startDate: "1999-01-06T00:00:00Z" },
      ],
      ...overrides,
    } as CongressApiCommitteeDetail;
  }

  it("names the committee from its most recent history entry and takes the chamber from the route", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(apiCommitteeDetail(), "hspw00", "house");

    expect(profile).toMatchObject({ name: "Committee on Public Works", chamber: "house", systemCode: "hspw00" });
    expect(profile?.history.map((entry): string => entry.name)).toEqual([
      "Committee on Public Works",
      "Committee on Roads and Waterways",
    ]);
  });

  it("returns null when no history entry names the committee", (): void => {
    // Inventing a name from the system code would be a guess printed as a fact.
    expect(mapCommitteeProfile(apiCommitteeDetail({ history: [] }), "hspw00", "house")).toBeNull();
    expect(
      mapCommitteeProfile(apiCommitteeDetail({ history: [{ startDate: "2015-01-06" }] }), "x", "house"),
    ).toBeNull();
  });

  it("falls back to the looked-up code when the payload omits one", (): void => {
    expect(mapCommitteeProfile(apiCommitteeDetail({ systemCode: undefined }), "HSPW00", "house")?.systemCode).toBe(
      "hspw00",
    );
  });

  it("treats an absent isCurrent flag as false, as the API only omits it for bodies no longer constituted", (): void => {
    expect(mapCommitteeProfile(apiCommitteeDetail({ isCurrent: undefined }), "hspw00", "house")?.isCurrent).toBe(false);
  });

  it("carries a parent only when the reference is usable, and sorts subcommittees by name", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(
      apiCommitteeDetail({
        parent: { systemCode: "HSPW00", name: "Committee on Public Works" },
        subcommittees: [
          { systemCode: "hspw02", name: "Water Systems" },
          { systemCode: "hspw01", name: "Bridges" },
          { name: "Nameless code" },
        ],
      }),
      "hspw01",
      "house",
    );
    const orphan: CommitteeProfile | null = mapCommitteeProfile(
      apiCommitteeDetail({ parent: { name: "No code" } }),
      "hspw00",
      "house",
    );

    expect(profile?.parent?.systemCode).toBe("hspw00");
    expect(profile?.subcommittees.map((sub): string => sub.name)).toEqual(["Bridges", "Water Systems"]);
    expect(profile?.subcommitteeCount).toBe(2);
    expect(orphan?.parent).toBeUndefined();
  });
});

describe("sortByDateDesc", (): void => {
  it("orders newest first without mutating the input", (): void => {
    const input = [{ date: "2024-01-01" }, { date: "2026-01-01" }, { date: "2025-01-01" }];
    const sorted = sortByDateDesc(input, "date");

    expect(sorted.map((item): string => item.date)).toEqual(["2026-01-01", "2025-01-01", "2024-01-01"]);
    expect(input[0]?.date).toBe("2024-01-01");
  });

  it("sorts undated records last rather than dropping them", (): void => {
    // An undated summary is still a real summary. Two of them, so the comparator meets a missing date on both sides.
    const sorted = sortByDateDesc(
      [{ actionDate: undefined }, { actionDate: "2026-01-01" }, { actionDate: undefined }] as { actionDate?: string }[],
      "actionDate",
    );

    expect(sorted).toHaveLength(3);
    expect(sorted[0]?.actionDate).toBe("2026-01-01");
  });
});

describe("mapUsable", (): void => {
  it("keeps the records that mapped and drops the ones that did not", (): void => {
    expect(mapUsable([1, 2, 3, 4], (n: number): string | null => (n % 2 === 0 ? `#${n}` : null))).toEqual(["#2", "#4"]);
  });

  it("treats an omitted collection as an empty one", (): void => {
    expect(mapUsable(undefined, (n: number): number => n)).toEqual([]);
  });
});
