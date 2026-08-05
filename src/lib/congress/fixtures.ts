import {
  type CommitteeBillReferral,
  type CommitteeNomination,
  type CommitteeRecordsQuery,
  type CommitteeRecordsResult,
  type CommitteeReport,
  pageOfCommitteeRecords,
} from "@/lib/congress/committee-records";
import {
  type CommitteeProfile,
  type CommitteeSummary,
  compareCommitteesByName,
  type Subcommittee,
} from "@/lib/congress/committees";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  compareMembersByName,
  congressChambers,
  type MemberDirectoryEntry,
  type MemberProfile,
  type PartyTally,
} from "@/lib/congress/members";
import { billIdentityKey, compareBillsByRecency, type LegislativeBill } from "@/lib/congress/types";

/**
 * Clearly labeled fixture records, so the application renders without an API key.
 *
 * **These are not real legislative records and must never be represented as live data.** Every surface that displays
 * them pairs them with a `DataSourceNotice` saying so, and each fixture links only to the Congress.gov *home page*
 * rather than to a plausible-looking bill URL — a fabricated deep link is the single easiest way for preview content to
 * be mistaken for the official record.
 *
 * The set deliberately spans several Congresses and every `BillStage`, so filtering, the Congress switcher, and the
 * journey stepper are all exercisable without a key.
 */
export const previewBills: LegislativeBill[] = [
  {
    congress: 119,
    type: "HR",
    number: "284",
    title: "Community Water Reliability Act",
    originChamber: "House",
    introducedDate: "2026-07-08",
    latestAction: {
      date: "2026-07-14",
      text: "Referred to the House Committee on Transportation and Infrastructure.",
    },
    policyArea: "Public works and water resources",
    stage: "committee",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Rep. Bennett, Marcus T. [D-OH-9]", party: "D", state: "OH", bioguideId: "PREVIEW-1" },
    cosponsorCount: 12,
  },
  {
    congress: 119,
    type: "S",
    number: "917",
    title: "Public Service Data Access Act",
    originChamber: "Senate",
    introducedDate: "2026-07-01",
    latestAction: {
      date: "2026-07-13",
      text: "Passed Senate with an amendment by unanimous consent.",
    },
    policyArea: "Government operations and politics",
    stage: "chamber",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Sen. Alvarez, Priya R. [R-AZ]", party: "R", state: "AZ", bioguideId: "PREVIEW-2" },
    cosponsorCount: 34,
  },
  {
    congress: 119,
    type: "HJRES",
    number: "66",
    title: "A Joint Resolution on National Service Learning",
    originChamber: "House",
    introducedDate: "2026-06-27",
    latestAction: {
      date: "2026-07-11",
      text: "Introduced in House.",
    },
    policyArea: "Education",
    stage: "introduced",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Rep. Okafor, Daniel K. [D-GA-4]", party: "D", state: "GA", bioguideId: "PREVIEW-3" },
    cosponsorCount: 3,
  },
  {
    congress: 119,
    type: "S",
    number: "842",
    title: "Federal Records Modernization Act",
    originChamber: "Senate",
    introducedDate: "2026-06-16",
    latestAction: {
      date: "2026-07-09",
      text: "Presented to President.",
    },
    policyArea: "Government operations and politics",
    stage: "president",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Sen. Whitmore, Louise B. [R-ME]", party: "R", state: "ME", bioguideId: "PREVIEW-4" },
    cosponsorCount: 21,
  },
  {
    congress: 118,
    type: "HR",
    number: "1219",
    title: "Rural Broadband Mapping Accuracy Act",
    originChamber: "House",
    introducedDate: "2024-02-12",
    latestAction: {
      date: "2024-05-20",
      text: "Became Public Law No: 118-46.",
    },
    policyArea: "Communications",
    stage: "law",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Rep. Castillo, Ana P. [D-TX-20]", party: "D", state: "TX", bioguideId: "PREVIEW-5" },
    cosponsorCount: 47,
  },
  {
    congress: 117,
    type: "HR",
    number: "5822",
    title: "Rural Veterans Telehealth Access Act",
    originChamber: "House",
    introducedDate: "2021-11-04",
    latestAction: {
      date: "2022-12-27",
      text: "Became Public Law No: 117-263.",
    },
    policyArea: "Health",
    stage: "law",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Rep. Dupont, Lauren M. [D-NM-2]", party: "D", state: "NM", bioguideId: "PREVIEW-6" },
    cosponsorCount: 58,
  },
  {
    congress: 116,
    type: "S",
    number: "3084",
    title: "Community Composting Infrastructure Act",
    originChamber: "Senate",
    introducedDate: "2019-12-11",
    latestAction: {
      date: "2020-09-16",
      text: "Passed Senate without amendment by voice vote.",
    },
    policyArea: "Environmental protection",
    // A deliberate example of a bill that passed one chamber but never became law — the 116th Congress ended before the
    // House took it up. Illustrates the same "passing one chamber isn't the same as becoming law" point the
    // /learn/how-a-bill-becomes-law lesson makes, but on a real (if fictional) historical record instead of just in the
    // abstract.
    stage: "chamber",
    officialUrl: "https://www.congress.gov/",
    sponsor: { fullName: "Sen. Halloran, Peter J. [R-IA]", party: "R", state: "IA", bioguideId: "PREVIEW-7" },
    cosponsorCount: 9,
  },
];

/**
 * The first preview fixture, as a plain never-undefined reference.
 *
 * A convenience for tests exercising a single representative bill, so each one doesn't need its own non-null assertion
 * against `previewBills[0]` under `noUncheckedIndexedAccess`.
 */
export const firstPreviewBill: LegislativeBill = previewBills[0] as LegislativeBill;

/**
 * Fictional, illustrative summaries for the preview fixtures, keyed by `billIdentityKey`. Used only when no API key is
 * configured, so a bill's Summary section has something to show instead of an empty box — never presented as a real
 * Congressional Research Service summary (the UI labels it explicitly; see the bill detail page).
 */
export const previewSummaries: Record<string, string> = {
  "119-HR-284":
    "This bill would direct the Environmental Protection Agency to create a matching-grant program that helps small " +
    "and rural water systems replace aging pipes and monitoring equipment. Participating utilities would also have " +
    "to publish annual water-quality testing results in a standard, publicly searchable format.",
  "119-S-917":
    "This bill would require federal agencies to publish a machine-readable index of the public datasets they " +
    "maintain and to name a data-access contact for each one. It would also direct the Office of Management and " +
    "Budget to report to Congress each year on how well agencies are complying.",
  "119-HJRES-66":
    "This joint resolution would express the sense of Congress in support of expanding service-learning " +
    "opportunities in secondary schools, and would encourage the Department of Education to publish model curricula " +
    "pairing coursework with community-service projects.",
  "119-S-842":
    "This bill would consolidate several federal records-retention systems into a single platform managed by the " +
    "National Archives and Records Administration, with new deadlines for agencies to digitize paper records they " +
    "still hold.",
  "118-HR-1219":
    "This bill directs the Federal Communications Commission to work with states to verify the accuracy of broadband " +
    "service-availability maps and establishes a formal process for consumers and local governments to challenge " +
    "incorrect coverage claims.",
  "117-HR-5822":
    "This bill would direct the Department of Veterans Affairs to expand telehealth grants for rural VA clinics and " +
    "to reimburse veterans for broadband costs incurred solely for scheduled telehealth appointments. It also " +
    "requires an annual report to Congress on rural telehealth usage and outcomes.",
  "116-S-3084":
    "This bill would establish a federal grant program to help cities and counties build or expand community " +
    "composting facilities, and would direct the Department of Agriculture to publish technical guidance for " +
    "municipalities starting a composting program for the first time.",
};

/**
 * Placeholder member records for the fictional sponsors named in {@link previewBills}, so the member page renders
 * without an API key.
 *
 * This does *not* loosen the policy that keeps the preview chamber diagram unattributed. The distinction is that these
 * seven people are already named on the preview bill records, so a reader who clicks a sponsor's name has already been
 * told they're looking at preview data — whereas a chamber diagram of 535 plausible names invites a reader to look up
 * their *own* representative and be quietly misinformed about who that is. Adding a page for a name the fixtures
 * already print is a smaller claim than inventing a roster.
 *
 * Two safeguards make the fiction impossible to mistake for a record:
 *
 * - **The IDs cannot be real.** `PREVIEW-1` and friends fail {@link isBioguideId}, so they're never sent upstream and
 *   never produce a Biographical Directory link — the page structurally cannot point at a real person's biography.
 * - **No official website.** Same reasoning as `previewBills`' bare congress.gov link: a fabricated deep link is the
 *   single easiest way for preview content to be mistaken for the official record.
 */
export const previewMemberProfiles: MemberProfile[] = [
  {
    bioguideId: "PREVIEW-1",
    name: "Bennett, Marcus T.",
    directOrderName: "Marcus T. Bennett",
    party: "democratic",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
    chamber: "house",
    currentMember: true,
    terms: [{ chamber: "house", congress: 119, startYear: 2025, memberType: "Representative", state: "Ohio" }],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-2",
    name: "Alvarez, Priya R.",
    directOrderName: "Priya R. Alvarez",
    party: "republican",
    partyName: "Republican",
    state: "Arizona",
    chamber: "senate",
    currentMember: true,
    terms: [{ chamber: "senate", congress: 119, startYear: 2025, memberType: "Senator", state: "Arizona" }],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-3",
    name: "Okafor, Daniel K.",
    directOrderName: "Daniel K. Okafor",
    party: "democratic",
    partyName: "Democratic",
    state: "Georgia",
    district: 4,
    chamber: "house",
    currentMember: true,
    terms: [{ chamber: "house", congress: 119, startYear: 2025, memberType: "Representative", state: "Georgia" }],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-4",
    name: "Whitmore, Louise B.",
    directOrderName: "Louise B. Whitmore",
    party: "republican",
    partyName: "Republican",
    state: "Maine",
    chamber: "senate",
    currentMember: true,
    terms: [{ chamber: "senate", congress: 119, startYear: 2025, memberType: "Senator", state: "Maine" }],
    leadership: [{ type: "Preview Leadership Role", congress: 119 }],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-5",
    name: "Castillo, Ana P.",
    directOrderName: "Ana P. Castillo",
    party: "democratic",
    partyName: "Democratic",
    state: "Texas",
    district: 20,
    chamber: "house",
    currentMember: false,
    terms: [
      { chamber: "house", congress: 118, startYear: 2023, endYear: 2025, memberType: "Representative", state: "Texas" },
    ],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-6",
    name: "Dupont, Lauren M.",
    directOrderName: "Lauren M. Dupont",
    party: "democratic",
    partyName: "Democratic",
    state: "New Mexico",
    district: 2,
    chamber: "house",
    currentMember: false,
    terms: [
      {
        chamber: "house",
        congress: 117,
        startYear: 2021,
        endYear: 2023,
        memberType: "Representative",
        state: "New Mexico",
      },
    ],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
  {
    bioguideId: "PREVIEW-7",
    name: "Halloran, Peter J.",
    directOrderName: "Peter J. Halloran",
    party: "republican",
    partyName: "Republican",
    state: "Iowa",
    chamber: "senate",
    currentMember: false,
    terms: [{ chamber: "senate", congress: 116, startYear: 2019, endYear: 2021, memberType: "Senator", state: "Iowa" }],
    leadership: [],
    sponsoredCount: 1,
    cosponsoredCount: 0,
  },
];

/**
 * Locates a preview member by ID.
 *
 * @param bioguideId - The raw route param, matched case-insensitively so a hand-typed URL still resolves.
 * @returns The matching placeholder member, or `undefined` — which the route renders as a 404, exactly as it would for
 *   a real ID that doesn't exist.
 */
export function findPreviewMemberProfile(bioguideId: string): MemberProfile | undefined {
  const wanted: string = bioguideId.trim().toUpperCase();
  return previewMemberProfiles.find((profile: MemberProfile): boolean => profile.bioguideId === wanted);
}

/**
 * The placeholder members as directory rows.
 *
 * Derived from {@link previewMemberProfiles} rather than kept as a second hand-maintained list, so the directory and
 * the member pages it links to can never disagree about who exists.
 *
 * This is a smaller claim than the chamber diagram's, and stays within the same policy: these seven names are already
 * printed on the preview bills, and the directory is the same length as that list — plainly seven placeholder people,
 * not a plausible-looking roster of a chamber. Note that some of them are *former* members, which a live directory of
 * currently-seated members would never contain; the route says which kind of list a reader is looking at rather than
 * quietly filtering the fixtures down to match a shape they were never built for.
 *
 * @returns One row per placeholder member, alphabetically.
 */
export function previewMemberDirectory(): MemberDirectoryEntry[] {
  return previewMemberProfiles
    .map(
      (profile: MemberProfile): MemberDirectoryEntry => ({
        bioguideId: profile.bioguideId,
        name: profile.name,
        party: profile.party,
        partyName: profile.partyName,
        state: profile.state,
        district: profile.district,
        chamber: profile.chamber,
      }),
    )
    .sort(compareMembersByName);
}

/**
 * The preview bills a placeholder member sponsored.
 *
 * Derived from `previewBills` by matching on the sponsor's ID rather than kept as a second hand-maintained list, so a
 * fixture bill and its sponsor's page can't disagree about who sponsored what.
 *
 * @param bioguideId - The placeholder member's ID, or `undefined` when no member resolved.
 * @returns Their sponsored bills, and an always-empty cosponsored list — the fixtures record a single sponsor per bill
 *   and nothing about cosponsors, and inventing a cosponsorship history would be a claim with nothing behind it.
 */
export function previewMemberLegislation(bioguideId: string | undefined): {
  sponsored: LegislativeBill[];
  cosponsored: LegislativeBill[];
} {
  if (!bioguideId) return { sponsored: [], cosponsored: [] };

  return {
    // Sorted on the same rule the live path uses, so `MemberProfileResult`'s "most recent first" holds regardless of
    // which branch produced the list — a fixture ordering is no more authoritative than an upstream one.
    sponsored: previewBills
      .filter((bill: LegislativeBill): boolean => bill.sponsor?.bioguideId === bioguideId)
      .sort(compareBillsByRecency),
    cosponsored: [],
  };
}

/**
 * The party split used to draw the preview chamber diagram.
 *
 * These are **illustrative placeholder counts**, chosen to be plainly round rather than to approximate any real
 * Congress — the point is to exercise the chart's layout, legend, and responsive behavior without an API key, in the
 * same spirit as `previewBills`. Reporting a real-looking party balance would be a factual claim about the current
 * Congress that this fixture has no way to keep true, which is exactly the kind of accidental misinformation the
 * preview-data policy exists to prevent. The chart labels these seats as placeholders wherever they're shown.
 */
export const previewChamberPartySplits: Record<CongressChamber, PartyTally[]> = {
  house: [
    { party: "democratic", count: 218 },
    { party: "republican", count: 217 },
  ],
  senate: [
    { party: "democratic", count: 49 },
    { party: "independent", count: 2 },
    { party: "republican", count: 49 },
  ],
};

/**
 * Builds one chamber's worth of unattributed placeholder seats.
 *
 * Each seat is named "Preview Seat N" rather than given a fictional member's name and jurisdiction. A chamber diagram
 * invites a reader to look up *their own* representative, and a fabricated roster of 535 plausible-looking names and
 * districts is a far easier thing to mistake for real data than a labeled placeholder is.
 *
 * @param chamber - Which chamber to populate.
 * @returns Placeholder members in the party proportions from {@link previewChamberPartySplits}.
 */
export function previewChamberMembers(chamber: CongressChamber): CongressMember[] {
  const members: CongressMember[] = [];

  for (const tally of previewChamberPartySplits[chamber]) {
    for (let seat: number = 0; seat < tally.count; seat++) {
      members.push({ name: `Preview Seat ${members.length + 1}`, party: tally.party });
    }
  }

  return members;
}

/**
 * Assembles a complete, clearly labeled placeholder {@link CongressComposition}.
 *
 * Used by the adapter's no-key and upstream-failure paths, and by tests that need a composition without stubbing a
 * fetch.
 *
 * @param congress - The Congress the placeholder stands in for.
 * @param retrievedAt - The timestamp to report, so preview data carries the same freshness signal live data does.
 * @param notice - The user-facing explanation of why placeholders are being shown. Defaults to the missing-key case.
 * @returns A composition marked `source: "preview"`.
 */
export function buildPreviewComposition(
  congress: number,
  retrievedAt: string,
  notice: string = "Placeholder seats are shown until a server-only Congress.gov API key is configured.",
): CongressComposition {
  return {
    congress,
    chambers: congressChambers.map(
      (chamber: CongressChamber): ChamberComposition =>
        buildChamberComposition(chamber, previewChamberMembers(chamber)),
    ),
    source: "preview",
    retrievedAt,
    notice,
  };
}

/**
 * Clearly labeled placeholder committees, so `/committees` renders without an API key.
 *
 * Held to the same policy as every other fixture in this file, with one extra care that is specific to committees. A
 * committee name is a *real-world institution's* name in a way a bill title isn't — "Committee on Agriculture" names a
 * body that exists — so these are deliberately built not to collide with one. Each is named for a subject no standing
 * committee of either chamber holds jurisdiction over, and each carries a system code that cannot pass
 * `isCommitteeSystemCode`, which is what stops a placeholder from ever being handed an official-record reference.
 *
 * The set spans all three chambers and four of the five committee types, so the directory's filters, sort, and empty
 * state are all exercisable without a key — the same reason `previewBills` spans several Congresses and every stage.
 */
export const previewCommitteeProfiles: CommitteeProfile[] = [
  {
    systemCode: "preview-01",
    name: "Preview Public Works Committee",
    chamber: "house",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 2,
    isCurrent: true,
    history: [
      {
        name: "Preview Committee on Public Works",
        startDate: "2015-01-06T00:00:00Z",
        establishingAuthority: "Placeholder record",
      },
      {
        name: "Preview Committee on Roads and Waterways",
        startDate: "1999-01-06T00:00:00Z",
        endDate: "2015-01-05T00:00:00Z",
      },
    ],
    subcommittees: [
      { systemCode: "preview-01a", name: "Preview Subcommittee on Bridges" },
      { systemCode: "preview-01b", name: "Preview Subcommittee on Water Systems" },
    ],
    // Every count here is the length of this committee's entry in `PREVIEW_COMMITTEE_RECORDS` rather than a rounder,
    // more impressive-looking figure. The counts are printed as headings directly above the records they count, so a
    // placeholder saying "128" over a list of five would be a fixture contradicting itself on screen.
    billCount: 5,
    reportCount: 3,
  },
  {
    systemCode: "preview-02",
    name: "Preview Records and Archives Committee",
    chamber: "senate",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 0,
    isCurrent: true,
    history: [
      {
        name: "Preview Committee on Records and Archives",
        startDate: "2007-01-04T00:00:00Z",
        establishingAuthority: "Placeholder record",
      },
    ],
    subcommittees: [],
    billCount: 3,
    reportCount: 2,
    nominationCount: 3,
  },
  {
    systemCode: "preview-03",
    name: "Preview Select Committee on Civic Data",
    chamber: "house",
    type: "select",
    typeName: "Select",
    subcommitteeCount: 0,
    isCurrent: true,
    history: [{ name: "Preview Select Committee on Civic Data", startDate: "2023-01-03T00:00:00Z" }],
    subcommittees: [],
    billCount: 2,
  },
  {
    systemCode: "preview-04",
    name: "Preview Joint Committee on Plain Language",
    chamber: "joint",
    type: "joint",
    typeName: "Joint",
    subcommitteeCount: 0,
    isCurrent: true,
    history: [{ name: "Preview Joint Committee on Plain Language", startDate: "1991-01-03T00:00:00Z" }],
    subcommittees: [],
    reportCount: 4,
  },
  {
    systemCode: "preview-05",
    name: "Preview Commission on Placeholder Records",
    chamber: "joint",
    type: "commission",
    typeName: "Commission or Caucus",
    subcommitteeCount: 0,
    // A body no longer constituted, so the detail page's "no longer active" state is reachable without a key.
    isCurrent: false,
    history: [
      {
        name: "Preview Commission on Placeholder Records",
        startDate: "1985-01-03T00:00:00Z",
        endDate: "2011-01-05T00:00:00Z",
      },
    ],
    subcommittees: [],
    reportCount: 2,
  },
];

/**
 * Placeholder record collections, so a committee page's bills, reports, and nominations render without an API key.
 *
 * Keyed by the same system codes {@link previewCommitteeProfiles} uses, and sized to match each profile's declared
 * counts exactly — those counts are printed as headings directly above these records, so a set that disagreed with its
 * own count would be a fixture contradicting itself on screen.
 *
 * The referrals reuse {@link previewBills} rather than inventing measures of their own. That is the same rule the
 * preview member legislation follows, and it buys the same thing: a placeholder committee's bill list links to pages
 * that exist in preview mode, so following one is a working journey rather than a 404 that makes the fixtures look
 * broken. One referral per committee deliberately carries **no** bill record, which is what makes the
 * title-lookup-failed row reachable without a key.
 *
 * The reports and nominations are fictional in the strong sense: no real report citation or nomination number appears
 * here. `PREVIEW` where a chamber's letter would go is what keeps `"PREVIEW Rept. 119-4"` from being mistaken for a
 * citation anyone could look up.
 */
const PREVIEW_COMMITTEE_RECORDS: Record<string, CommitteeRecordSets> = {
  "preview-01": {
    bills: [
      previewReferral("119-HR-284", "Referred To", "2026-07-14T00:00:00Z"),
      previewReferral("119-HJRES-66", "Referred To", "2026-07-11T00:00:00Z"),
      previewReferral("118-HR-1219", "Reported By", "2024-04-02T00:00:00Z"),
      previewReferral("117-HR-5822", "Reported By", "2022-06-08T00:00:00Z"),
      // No matching preview bill, so this row exercises the "the title lookup found nothing" state.
      { congress: 119, type: "HR", number: "9042", relationship: "Referred To", actionDate: "2026-05-19T00:00:00Z" },
    ],
    reports: [
      {
        citation: "PREVIEW Rept. 119-4",
        congress: 119,
        type: "PREVIEW",
        number: 4,
        updateDate: "2026-06-02T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 118-77, Part 1",
        congress: 118,
        type: "PREVIEW",
        number: 77,
        part: 1,
        updateDate: "2024-04-30T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 117-12",
        congress: 117,
        type: "PREVIEW",
        number: 12,
        updateDate: "2022-05-14T00:00:00Z",
      },
    ],
    nominations: [],
  },
  "preview-02": {
    bills: [
      previewReferral("119-S-917", "Reported By", "2026-07-13T00:00:00Z"),
      previewReferral("119-S-842", "Referred To", "2026-06-20T00:00:00Z"),
      previewReferral("116-S-3084", "Referred To", "2020-01-08T00:00:00Z"),
    ],
    reports: [
      {
        citation: "PREVIEW Rept. 119-31",
        congress: 119,
        type: "PREVIEW",
        number: 31,
        updateDate: "2026-05-05T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 118-9",
        congress: 118,
        type: "PREVIEW",
        number: 9,
        updateDate: "2024-02-19T00:00:00Z",
      },
    ],
    nominations: [
      {
        citation: "PREVIEW PN0001",
        congress: 119,
        description:
          "A placeholder nominee, of a placeholder jurisdiction, to be a placeholder officer of the United States for a term of four years.",
        receivedDate: "2026-06-04",
        latestAction: {
          date: "2026-06-04",
          text: "Received in the Senate and referred to the Preview Committee on Records and Archives.",
        },
      },
      {
        citation: "PREVIEW PN0002",
        congress: 119,
        description:
          "A second placeholder nominee, of a placeholder jurisdiction, to be a placeholder deputy officer of the United States.",
        receivedDate: "2026-04-21",
        latestAction: { date: "2026-05-30", text: "Placeholder committee action reported to the Senate." },
      },
      {
        citation: "PREVIEW PN0003",
        congress: 118,
        description: "A third placeholder nominee, of a placeholder jurisdiction, to be a placeholder commissioner.",
        receivedDate: "2024-09-02",
      },
    ],
  },
  "preview-03": {
    bills: [
      previewReferral("119-HR-284", "Referred To", "2026-07-15T00:00:00Z"),
      previewReferral("118-HR-1219", "Referred To", "2024-03-11T00:00:00Z"),
    ],
    reports: [],
    nominations: [],
  },
  "preview-04": {
    bills: [],
    reports: [
      {
        citation: "PREVIEW Rept. 119-2",
        congress: 119,
        type: "PREVIEW",
        number: 2,
        updateDate: "2026-03-17T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 118-40",
        congress: 118,
        type: "PREVIEW",
        number: 40,
        updateDate: "2024-07-22T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 117-88",
        congress: 117,
        type: "PREVIEW",
        number: 88,
        updateDate: "2022-09-13T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 116-5",
        congress: 116,
        type: "PREVIEW",
        number: 5,
        updateDate: "2020-01-30T00:00:00Z",
      },
    ],
    nominations: [],
  },
  "preview-05": {
    bills: [],
    reports: [
      {
        citation: "PREVIEW Rept. 111-61",
        congress: 111,
        type: "PREVIEW",
        number: 61,
        updateDate: "2010-11-08T00:00:00Z",
      },
      {
        citation: "PREVIEW Rept. 110-19",
        congress: 110,
        type: "PREVIEW",
        number: 19,
        updateDate: "2008-06-25T00:00:00Z",
      },
    ],
    nominations: [],
  },
};

/** One placeholder committee's three collections. */
type CommitteeRecordSets = {
  bills: CommitteeBillReferral[];
  reports: CommitteeReport[];
  nominations: CommitteeNomination[];
};

/**
 * Builds a placeholder referral around one of the preview bills.
 *
 * @param key - The bill's `billIdentityKey`, e.g., `"119-HR-284"`.
 * @param relationship - What the committee did with it.
 * @param actionDate - When, as an ISO 8601 timestamp.
 * @returns The referral, carrying the preview bill's own record so the row renders with a title. A key naming no
 *   preview bill yields a referral with no bill, which is the same shape a failed live title lookup produces.
 */
function previewReferral(key: string, relationship: string, actionDate: string): CommitteeBillReferral {
  const bill: LegislativeBill | undefined = previewBills.find(
    (candidate: LegislativeBill): boolean => billIdentityKey(candidate) === key,
  );
  const [congress = "0", type = "HR", number = "0"]: string[] = key.split("-");

  return { congress: Number(congress), type, number, relationship, actionDate, bill };
}

/**
 * Resolves one page of a placeholder committee's records.
 *
 * Pages the fixture list with the same arithmetic the live path uses rather than always returning everything, so the
 * pager's own behavior — a clamped page, a correct range line, a disabled edge — is exercisable without a key. A code
 * naming no placeholder committee yields an empty page rather than nothing, since the caller has already decided a page
 * is being rendered.
 *
 * @param systemCode - The raw system code route param, matched case-insensitively.
 * @param query - Which collection to read and how far into it.
 * @returns The page, shaped exactly as the live path's is.
 */
export function previewCommitteeRecords(systemCode: string, query: CommitteeRecordsQuery): CommitteeRecordsResult {
  const sets: CommitteeRecordSets = PREVIEW_COMMITTEE_RECORDS[systemCode.trim().toLowerCase()] ?? {
    bills: [],
    reports: [],
    nominations: [],
  };

  // Branched per kind rather than indexed once, so each call hands `pageOfCommitteeRecords` a `kind` that is still a
  // literal — the same narrowing the live fetcher gets by returning from inside each of its own branches.
  if (query.kind === "reports") return pageOfCommitteeRecords("reports", sets.reports, query.page);
  if (query.kind === "nominations") return pageOfCommitteeRecords("nominations", sets.nominations, query.page);

  return pageOfCommitteeRecords("bills", sets.bills, query.page);
}

/**
 * The placeholder committees as directory rows.
 *
 * Derived from {@link previewCommitteeProfiles} rather than kept as a second hand-maintained list, so the directory and
 * the pages it links to can never disagree about which committees exist.
 *
 * @returns One row per placeholder committee, alphabetically.
 */
export function previewCommitteeDirectory(): CommitteeSummary[] {
  return previewCommitteeProfiles
    .map(
      (profile: CommitteeProfile): CommitteeSummary => ({
        systemCode: profile.systemCode,
        name: profile.name,
        chamber: profile.chamber,
        type: profile.type,
        typeName: profile.typeName,
        subcommitteeCount: profile.subcommitteeCount,
      }),
    )
    .sort(compareCommitteesByName);
}

/**
 * Locates a preview committee by chamber and system code.
 *
 * Matched on both, not just the code, for the same reason the live lookup takes both: a committee's chamber is part of
 * its identity, and resolving `/committees/senate/preview-01` to a House committee would render a page that contradicts
 * the URL that reached it.
 *
 * Subcommittees resolve too, promoted to profiles of their own: a parent's page links to each of them, and a link that
 * 404s in preview mode would make the fixtures look broken rather than placeholder.
 *
 * @param chamber - The raw chamber route param, matched case-insensitively.
 * @param systemCode - The raw system code route param, matched case-insensitively.
 * @returns The matching placeholder committee, or `undefined` — which the route renders as a 404, exactly as it would
 *   for a real code that doesn't exist.
 */
export function findPreviewCommitteeProfile(chamber: string, systemCode: string): CommitteeProfile | undefined {
  const wantedChamber: string = chamber.trim().toLowerCase();
  const wantedCode: string = systemCode.trim().toLowerCase();

  const parent: CommitteeProfile | undefined = previewCommitteeProfiles.find(
    (profile: CommitteeProfile): boolean => profile.systemCode === wantedCode && profile.chamber === wantedChamber,
  );
  if (parent) return parent;

  for (const profile of previewCommitteeProfiles) {
    if (profile.chamber !== wantedChamber) continue;

    const child: Subcommittee | undefined = profile.subcommittees.find(
      (subcommittee: Subcommittee): boolean => subcommittee.systemCode === wantedCode,
    );
    if (!child) continue;

    return {
      systemCode: child.systemCode,
      name: child.name,
      chamber: profile.chamber,
      type: profile.type,
      typeName: profile.typeName,
      parent: { systemCode: profile.systemCode, name: profile.name },
      subcommitteeCount: 0,
      isCurrent: profile.isCurrent,
      history: [{ name: child.name, startDate: profile.history.at(-1)?.startDate }],
      subcommittees: [],
    };
  }

  return undefined;
}
