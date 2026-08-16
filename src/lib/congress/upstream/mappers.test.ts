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
  BillAction,
  BillSummary,
  BillTextVersion,
  LegislativeBill,
  RecordedVote,
} from "@/lib/congress/bills/model";
import type { CommitteeProfile, CommitteeSummary } from "@/lib/congress/committees/model";
import type { MemberProfile } from "@/lib/congress/members/model";
import type {
  CongressApiBill,
  CongressApiCommittee,
  CongressApiCommitteeDetail,
  CongressApiMember,
  CongressApiMemberDetail,
  CongressApiRecordedVote,
} from "@/lib/congress/upstream/api-schema";
import {
  asOriginChamber,
  collectRecordedVotes,
  mapBillCommittee,
  mapBillCommitteeActivity,
  mapBillSubcommittee,
  mapCommitteeBillReferral,
  mapCommitteeHistory,
  mapCommitteeNomination,
  mapCommitteeProfile,
  mapCommitteeRef,
  mapCommitteeReport,
  mapCongressAction,
  mapCongressBill,
  mapCongressCommittee,
  mapCongressMember,
  mapCongressSummary,
  mapCongressTextVersion,
  mapEnactedLaw,
  mapLeadershipRole,
  mapMemberProfile,
  mapMemberTerm,
  mapRecordedVote,
  mapUsable,
  type SeatedMember,
  sortByDateDesc,
} from "@/lib/congress/upstream/mappers";

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

  it("carries the law a bill became, and lets it establish the stage outright", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({
        laws: [{ type: "Public Law", number: "119-21" }],
        // Deliberately a latest action that says nothing about enactment: the published `laws` field is what settles
        // this, not a phrase the prose classifier happened to recognize.
        latestAction: { actionDate: "2026-07-04", text: "Message on Senate action sent to the House." },
      }),
    );

    expect(bill?.enactedLaw).toEqual({ type: "Public Law", number: "119-21" });
    expect(bill?.stage).toBe("law");
  });

  it("falls back to the prose classifier for a bill the record names no law for", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({
        laws: undefined,
        latestAction: { actionDate: "2026-07-04", text: "Referred to the Committee on Rules." },
      }),
    );

    expect(bill?.enactedLaw).toBeUndefined();
    expect(bill?.stage).toBe("committee");
  });

  it("ignores a half-written law rather than pinning a stage on it", (): void => {
    // "Public Law" with no number names no specific law, and a bare number names nothing at all. The action codes can
    // still establish enactment on their own, so a partial record is dropped rather than propped up.
    expect(mapCongressBill(apiBill({ laws: [{ type: "Public Law" }] }))?.enactedLaw).toBeUndefined();
    expect(mapCongressBill(apiBill({ laws: [{ number: "119-21" }] }))?.enactedLaw).toBeUndefined();
  });

  it("carries the publisher's own sizes for the collections hanging off a bill", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({
        actions: { count: 59 },
        committees: { count: 1 },
        summaries: { count: 5 },
        textVersions: { count: 6 },
        relatedBills: { count: 38 },
      }),
    );

    expect(bill?.collectionCounts).toEqual({
      actions: 59,
      committees: 1,
      summaries: 5,
      textVersions: 6,
      relatedBills: 38,
    });
  });

  it("carries a partial set of counts rather than requiring every one", (): void => {
    // A bill can be published with some of these and not others, and the one figure that did arrive is still the
    // publisher's answer for its own collection.
    expect(mapCongressBill(apiBill({ actions: { count: 3 } }))?.collectionCounts).toEqual({
      actions: 3,
      committees: undefined,
      summaries: undefined,
      textVersions: undefined,
      relatedBills: undefined,
    });
  });

  it("leaves the counts absent entirely for a record that published none", (): void => {
    // Which is every bill from the *list* endpoint. `undefined` and "a set of undefined counts" mean different things to
    // the bill page — "never asked" versus "asked and told nothing" — so they must not collapse into one another.
    expect(mapCongressBill(apiBill())?.collectionCounts).toBeUndefined();
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
    expect(bill?.cosponsorTally).toBeUndefined();
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

  it("prefers the published public URL over deriving one", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ legislationUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284" }),
    );

    expect(bill?.officialUrl).toBe("https://www.congress.gov/bill/119th-congress/house-bill/284");
  });

  it("still derives the public URL for a list-endpoint record, which does not publish one", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(apiBill({ legislationUrl: undefined }));

    expect(bill?.officialUrl).toBe("https://www.congress.gov/bill/119th-congress/house-bill/284");
  });
});

describe("mapRecordedVote", (): void => {
  /** A complete recorded-vote reference, as the actions endpoint sends one. */
  function apiVote(overrides: Partial<CongressApiRecordedVote> = {}): CongressApiRecordedVote {
    return {
      chamber: "House",
      congress: 119,
      date: "2025-07-03T18:31:38Z",
      rollNumber: 190,
      sessionNumber: 1,
      url: "https://clerk.house.gov/evs/2025/roll190.xml",
      ...overrides,
    };
  }

  it("maps a complete reference and normalizes the chamber to the app's spelling", (): void => {
    expect(mapRecordedVote(apiVote())).toEqual({
      chamber: "House",
      congress: 119,
      date: "2025-07-03T18:31:38Z",
      rollNumber: 190,
      sessionNumber: 1,
      url: "https://clerk.house.gov/evs/2025/roll190.xml",
    });
  });

  it("accepts the Senate's rows, which reach this app only through a bill's actions", (): void => {
    // There is no `senate-vote` endpoint, so this is the only path a Senate roll call has into the product at all.
    const vote: RecordedVote | null = mapRecordedVote(
      apiVote({ chamber: "Senate", rollNumber: 329, url: "https://www.senate.gov/legislative/roll329.htm" }),
    );

    expect(vote?.chamber).toBe("Senate");
    expect(vote?.rollNumber).toBe(329);
  });

  it("returns null unless the vote can be both named and reached", (): void => {
    expect(mapRecordedVote(apiVote({ chamber: undefined }))).toBeNull();
    expect(mapRecordedVote(apiVote({ chamber: "Joint Session" }))).toBeNull();
    expect(mapRecordedVote(apiVote({ rollNumber: undefined }))).toBeNull();
    expect(mapRecordedVote(apiVote({ congress: undefined }))).toBeNull();
    expect(mapRecordedVote(apiVote({ url: undefined }))).toBeNull();
  });

  it("keeps a vote that is merely missing its session number", (): void => {
    expect(mapRecordedVote(apiVote({ sessionNumber: undefined, date: undefined }))).not.toBeNull();
  });
});

describe("mapCongressAction", (): void => {
  it("maps a complete action, including the votes it records", (): void => {
    const mapped: BillAction | null = mapCongressAction({
      actionCode: "8000",
      actionDate: "2025-07-03",
      text: "Passed/agreed to in House.",
      type: "Floor",
      sourceSystem: { code: 9, name: "Library of Congress" },
      recordedVotes: [
        { chamber: "House", congress: 119, rollNumber: 190, sessionNumber: 1, url: "https://clerk.house.gov/a.xml" },
      ],
    });

    expect(mapped).toMatchObject({ actionCode: "8000", date: "2025-07-03", type: "Floor" });
    expect(mapped?.recordedVotes).toHaveLength(1);
  });

  it("returns null for an action with no text, which is a bullet with nothing in it", (): void => {
    expect(mapCongressAction({ actionDate: "2025-07-03" })).toBeNull();
    expect(mapCongressAction({ text: "   " })).toBeNull();
  });

  it("keeps an action that carries only its text", (): void => {
    // The rows without a code are the majority, and dropping them would empty out most of the history.
    const mapped: BillAction | null = mapCongressAction({ text: "Introduced in House" });

    expect(mapped).toEqual({
      date: undefined,
      text: "Introduced in House",
      type: undefined,
      actionCode: undefined,
      recordedVotes: [],
    });
  });

  it("drops an unusable vote without dropping the action it hangs off", (): void => {
    const mapped: BillAction | null = mapCongressAction({
      text: "Passed/agreed to in House.",
      recordedVotes: [{ chamber: "House" }],
    });

    expect(mapped).not.toBeNull();
    expect(mapped?.recordedVotes).toEqual([]);
  });
});

describe("collectRecordedVotes", (): void => {
  /** One vote reference, spread across however many actions a caller wants to attach it to. */
  const roll190: RecordedVote = {
    chamber: "House",
    congress: 119,
    date: "2025-07-03T18:31:38Z",
    rollNumber: 190,
    sessionNumber: 1,
    url: "https://clerk.house.gov/evs/2025/roll190.xml",
  };

  it("reports one vote once, however many actions reference it", (): void => {
    // HR 1 in the 119th genuinely lists roll 190 twice — once from House floor actions, once from the Library of
    // Congress. Printing it twice would read as two separate votes on the same question.
    const votes: RecordedVote[] = collectRecordedVotes([
      { text: "On motion that the House agree…", recordedVotes: [roll190] },
      { text: "Resolving differences -- House actions…", recordedVotes: [roll190] },
    ]);

    expect(votes).toEqual([roll190]);
  });

  it("keeps distinct votes apart, including across chambers", (): void => {
    const senateVote: RecordedVote = { ...roll190, chamber: "Senate", rollNumber: 329, date: "2025-07-01T12:00:00Z" };
    const votes: RecordedVote[] = collectRecordedVotes([
      { text: "House passage.", recordedVotes: [roll190] },
      { text: "Senate passage.", recordedVotes: [senateVote] },
    ]);

    // Same roll number in different chambers, or different sessions, are different votes — so identity has to carry
    // more than the number.
    expect(votes).toHaveLength(2);
    // Most recent first, like every other date-ordered list in this adapter.
    expect(votes[0]).toEqual(roll190);
  });

  it("returns nothing for a history with no recorded votes, which is the ordinary case", (): void => {
    expect(collectRecordedVotes([{ text: "Referred to the Committee on Finance.", recordedVotes: [] }])).toEqual([]);
    expect(collectRecordedVotes([])).toEqual([]);
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

  it("carries the portrait the list endpoint publishes, sanitizing its credit like the item record's", (): void => {
    // The one field where the list record is not the poorer of the two, which is what lets `/members` show faces
    // without one extra request per member. Sanitized through the same `mapMemberDepiction` the profile uses.
    const seated: SeatedMember | null = mapCongressMember({
      name: "Alvarez, Priya R.",
      terms: { item: [{ chamber: "Senate" }] },
      depiction: {
        imageUrl: "https://www.congress.gov/img/member/a000001_200.jpg",
        attribution: '<a href="https://www.senate.gov/art">Courtesy U.S. Senate</a><script>alert(1)</script>',
      },
    } as CongressApiMember);

    expect(seated?.member.depiction?.imageUrl).toBe("https://www.congress.gov/img/member/a000001_200.jpg");
    expect(seated?.member.depiction?.attribution).toContain("Courtesy U.S. Senate");
    expect(seated?.member.depiction?.attribution).not.toContain("<script>");
  });

  it("leaves the portrait absent for a record publishing none", (): void => {
    const seated: SeatedMember | null = mapCongressMember({
      name: "Bennett, Marcus T.",
      terms: { item: [{ chamber: "House of Representatives" }] },
    } as CongressApiMember);

    expect(seated?.member.depiction).toBeUndefined();
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

describe("mapEnactedLaw", (): void => {
  it("keeps a law only when both halves of the citation are present", (): void => {
    expect(mapEnactedLaw({ type: " Public Law ", number: " 119-21 " })).toEqual({
      type: "Public Law",
      number: "119-21",
    });
    expect(mapEnactedLaw({ type: "Public Law", number: "  " })).toBeNull();
    expect(mapEnactedLaw({ type: undefined, number: "119-21" })).toBeNull();
    expect(mapEnactedLaw({})).toBeNull();
  });
});

describe("mapBillCommitteeActivity", (): void => {
  it("keeps a named activity, with or without a date", (): void => {
    expect(mapBillCommitteeActivity({ name: " Referred To ", date: "2025-01-03T16:00:35Z" })).toEqual({
      name: "Referred To",
      date: "2025-01-03T16:00:35Z",
    });
    expect(mapBillCommitteeActivity({ name: "Markup By" })).toEqual({ name: "Markup By", date: undefined });
  });

  it("drops the endpoint's own non-answer rather than printing it", (): void => {
    // Congress.gov publishes a literal "Unknown" on a large share of these rows. Printing it reads as a gap in this
    // app rather than in the record. @see UNNAMED_COMMITTEE_ACTIVITY.
    expect(mapBillCommitteeActivity({ name: "Unknown" })).toBeNull();
    expect(mapBillCommitteeActivity({ name: "unknown", date: "2025-05-22T10:48:46Z" })).toBeNull();
    expect(mapBillCommitteeActivity({ name: "   " })).toBeNull();
    expect(mapBillCommitteeActivity({})).toBeNull();
  });
});

describe("mapBillSubcommittee", (): void => {
  it("lower-cases the code and keeps whatever activities survived", (): void => {
    expect(
      mapBillSubcommittee({
        systemCode: "HSPW12",
        name: " Highways and Transit Subcommittee ",
        activities: [{ name: "Referred to" }, { name: "Unknown" }],
      }),
    ).toEqual({
      systemCode: "hspw12",
      name: "Highways and Transit Subcommittee",
      activities: [{ name: "Referred to", date: undefined }],
    });
  });

  it("treats an absent activities array as an empty one", (): void => {
    expect(mapBillSubcommittee({ systemCode: "hspw05", name: "Aviation Subcommittee" })?.activities).toEqual([]);
  });

  it("returns null without a code or a name, since neither a link nor a label could be built", (): void => {
    expect(mapBillSubcommittee({ systemCode: "hspw12" })).toBeNull();
    expect(mapBillSubcommittee({ name: "Aviation Subcommittee" })).toBeNull();
    expect(mapBillSubcommittee({ systemCode: "  ", name: "  " })).toBeNull();
  });
});

describe("mapBillCommittee", (): void => {
  it("maps a complete referral, normalizing the code, chamber, and type", (): void => {
    expect(
      mapBillCommittee({
        systemCode: "HSAG00",
        name: " Agriculture Committee ",
        chamber: "House",
        type: "Standing",
        activities: [{ name: "Referred To" }],
        subcommittees: [{ systemCode: "hsag14", name: "Livestock Subcommittee" }],
      }),
    ).toEqual({
      systemCode: "hsag00",
      name: "Agriculture Committee",
      chamber: "house",
      type: "standing",
      typeName: "Standing",
      activities: [{ name: "Referred To", date: undefined }],
      subcommittees: [{ systemCode: "hsag14", name: "Livestock Subcommittee", activities: [] }],
    });
  });

  it("treats absent activities and subcommittees as empty rather than missing", (): void => {
    const committee = mapBillCommittee({ systemCode: "ssju00", name: "Judiciary Committee", chamber: "Senate" });

    expect(committee?.activities).toEqual([]);
    expect(committee?.subcommittees).toEqual([]);
    // No `type` on the record still resolves to a group, since the five-way narrowing has a residual bucket.
    expect(committee?.type).toBe("other");
    expect(committee?.typeName).toBeUndefined();
  });

  it("orders subcommittees alphabetically, where the publisher's order carries nothing", (): void => {
    const committee = mapBillCommittee({
      systemCode: "hspw00",
      name: "Transportation and Infrastructure Committee",
      chamber: "House",
      subcommittees: [
        { systemCode: "hspw12", name: "Highways and Transit Subcommittee" },
        { systemCode: "hspw05", name: "Aviation Subcommittee" },
      ],
    });

    expect(committee?.subcommittees.map((sub): string => sub.name)).toEqual([
      "Aviation Subcommittee",
      "Highways and Transit Subcommittee",
    ]);
  });

  it("returns null when the referral could not be named, coded, or chambered", (): void => {
    expect(mapBillCommittee({ name: "Agriculture Committee", chamber: "House" })).toBeNull();
    expect(mapBillCommittee({ systemCode: "hsag00", chamber: "House" })).toBeNull();
    // "NoChamber" is the API's own value for a record that is not a committee of either body.
    expect(mapBillCommittee({ systemCode: "hsag00", name: "Agriculture Committee", chamber: "NoChamber" })).toBeNull();
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

  it("carries the committee's own site only when Congress.gov publishes one", (): void => {
    // The one per-committee outbound link this app can make, and only because it is stated rather than derived — the
    // congress.gov URL still cannot be built from anything in this payload.
    const published: CommitteeProfile | null = mapCommitteeProfile(
      apiCommitteeDetail({ committeeWebsiteUrl: "https://agriculture.house.gov/" }),
      "hspw00",
      "house",
    );

    expect(published?.websiteUrl).toBe("https://agriculture.house.gov/");
    expect(mapCommitteeProfile(apiCommitteeDetail(), "hspw00", "house")?.websiteUrl).toBeUndefined();
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

describe("the committee record mappers", (): void => {
  it("keeps the two fields no bill endpoint publishes", (): void => {
    // What the committee did with the measure and when: the whole reason a committee's bill list is worth reading
    // rather than being a filtered view of /bills.
    expect(
      mapCommitteeBillReferral({
        congress: 119,
        type: "hr",
        number: 10_000,
        relationshipType: "Reported By",
        actionDate: "2026-07-30T12:31:05Z",
      }),
    ).toEqual({
      congress: 119,
      type: "HR",
      number: "10000",
      relationship: "Reported By",
      actionDate: "2026-07-30T12:31:05Z",
    });
  });

  it("drops a referral missing any part of its identifier", (): void => {
    // Unlike a bill from the bill endpoints, this record has no title to fall back on.
    expect(mapCommitteeBillReferral({ type: "HR", number: "1" })).toBeNull();
    expect(mapCommitteeBillReferral({ congress: 119, number: "1" })).toBeNull();
    expect(mapCommitteeBillReferral({ congress: 119, type: "HR" })).toBeNull();
  });

  it("keeps a referral numbered zero, which is falsy but not absent", (): void => {
    expect(mapCommitteeBillReferral({ congress: 119, type: "HR", number: 0 })).toMatchObject({ number: "0" });
  });

  it("normalizes the timestamp spelling only the reports endpoint uses", (): void => {
    // A space where every other endpoint sends a `T`. Left alone, `formatDate` takes its bare-date branch and renders
    // the unparsed original.
    expect(mapCommitteeReport({ citation: "H. Rept. 109-710", updateDate: "2015-03-20 00:05:31+00:00" })).toMatchObject(
      { updateDate: "2015-03-20T00:05:31+00:00" },
    );
  });

  it("leaves an absent or blank timestamp undefined rather than manufacturing one", (): void => {
    expect(mapCommitteeReport({ citation: "H. Rept. 119-1" })?.updateDate).toBeUndefined();
    expect(mapCommitteeReport({ citation: "H. Rept. 119-1", updateDate: "   " })?.updateDate).toBeUndefined();
  });

  it("drops a report or nomination with no citation, which is all that names one", (): void => {
    expect(mapCommitteeReport({ congress: 109, number: 710 })).toBeNull();
    expect(mapCommitteeReport({ citation: "  " })).toBeNull();
    expect(mapCommitteeNomination({ description: "Someone, of somewhere." })).toBeNull();
    expect(mapCommitteeNomination({ citation: " " })).toBeNull();
  });

  it("carries a nomination's latest action only when it says something", (): void => {
    // An object holding two undefineds renders as an empty line rather than as no line.
    expect(mapCommitteeNomination({ citation: "PN1", latestAction: { actionDate: "2026-07-21" } })?.latestAction).toBe(
      undefined,
    );
    expect(
      mapCommitteeNomination({ citation: "PN1", latestAction: { actionDate: "2026-07-21", text: "Referred." } })
        ?.latestAction,
    ).toEqual({ date: "2026-07-21", text: "Referred." });
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

describe("mapCongressBill cosponsor tally", (): void => {
  it("carries both published figures, so the page can tell whether anyone withdrew", (): void => {
    const bill: LegislativeBill | null = mapCongressBill(
      apiBill({ cosponsors: { count: 40, countIncludingWithdrawnCosponsors: 43 } }),
    );

    expect(bill?.cosponsorTally).toEqual({ current: 40, includingWithdrawn: 43 });
  });

  it("carries whichever figure arrived when the record published only one", (): void => {
    expect(mapCongressBill(apiBill({ cosponsors: { count: 12 } }))?.cosponsorTally).toEqual({
      current: 12,
      includingWithdrawn: undefined,
    });
  });

  it("leaves the tally absent entirely for a record that published neither figure", (): void => {
    // Same distinction the collection counts draw: a list-endpoint bill was never asked, and the bill page's meta row
    // omits the cosponsor line rather than printing a zero it did not receive.
    expect(mapCongressBill(apiBill({ cosponsors: undefined }))?.cosponsorTally).toBeUndefined();
  });

  it("keeps a genuine zero, which is not the same as no answer", (): void => {
    expect(mapCongressBill(apiBill({ cosponsors: { count: 0 } }))?.cosponsorTally).toEqual({
      current: 0,
      includingWithdrawn: undefined,
    });
  });
});
