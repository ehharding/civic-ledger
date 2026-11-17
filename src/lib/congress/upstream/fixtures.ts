import {
  type BillCosponsor,
  billIdentityKey,
  CONGRESS_GOV_HOME,
  compareBillsByRecency,
  type LegislativeBill,
} from "@/lib/congress/bills/model";
import {
  type CommitteeProfile,
  type CommitteeSummary,
  compareCommitteesByName,
  type Subcommittee,
} from "@/lib/congress/committees/model";
import {
  type CommitteeBillReferral,
  type CommitteeNomination,
  type CommitteeRecordsQuery,
  type CommitteeRecordsResult,
  type CommitteeReport,
  pageOfCommitteeRecords,
} from "@/lib/congress/committees/records";
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
} from "@/lib/congress/members/model";
import type { MemberProfileResult } from "@/lib/congress/members/profile";

// Bills.

/**
 * Clearly labeled fixture records, so the app renders without an API key. **Not real records; never present them as
 * live.** Every surface pairs them with a `DataSourceNotice`, and each links only to {@link CONGRESS_GOV_HOME} — a
 * fabricated deep link is the easiest way for fiction to pass as the record.
 *
 * Spans several Congresses and every `BillStage`, so filters, the Congress switcher, and the stepper all work.
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Rep. Bennett, Marcus T. [D-OH-9]", party: "D", state: "OH", bioguideId: "PREVIEW-1" },
    cosponsorTally: { current: 12, includingWithdrawn: 12 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Sen. Alvarez, Priya R. [R-AZ]", party: "R", state: "AZ", bioguideId: "PREVIEW-2" },
    cosponsorTally: { current: 34, includingWithdrawn: 34 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Rep. Okafor, Daniel K. [D-GA-4]", party: "D", state: "GA", bioguideId: "PREVIEW-3" },
    cosponsorTally: { current: 3, includingWithdrawn: 3 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Sen. Whitmore, Louise B. [R-ME]", party: "R", state: "ME", bioguideId: "PREVIEW-4" },
    cosponsorTally: { current: 21, includingWithdrawn: 21 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Rep. Castillo, Ana P. [D-TX-20]", party: "D", state: "TX", bioguideId: "PREVIEW-5" },
    cosponsorTally: { current: 47, includingWithdrawn: 47 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Rep. Dupont, Lauren M. [D-NM-2]", party: "D", state: "NM", bioguideId: "PREVIEW-6" },
    cosponsorTally: { current: 58, includingWithdrawn: 58 },
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
    officialUrl: CONGRESS_GOV_HOME,
    sponsor: { fullName: "Sen. Halloran, Peter J. [R-IA]", party: "R", state: "IA", bioguideId: "PREVIEW-7" },
    cosponsorTally: { current: 9, includingWithdrawn: 9 },
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
 * Fictional cosponsors for the preview fixtures, keyed by `billIdentityKey`, so the static demo shows the section
 * working. Drawn only from the seven placeholder sponsors, whose `PREVIEW-n` IDs fail `isBioguideId` and so never reach
 * upstream. `isOriginal` is mixed to exercise both row branches.
 *
 * @see docs/data-policy.md
 */
export const previewCosponsors: Record<string, BillCosponsor[]> = {
  "119-HR-284": [
    {
      fullName: "Rep. Okafor, Daniel K. [D-GA-4]",
      bioguideId: "PREVIEW-3",
      party: "D",
      state: "GA",
      sponsorshipDate: "2026-02-11",
      isOriginal: true,
    },
    {
      fullName: "Rep. Castillo, Ana P. [D-TX-20]",
      bioguideId: "PREVIEW-5",
      party: "D",
      state: "TX",
      sponsorshipDate: "2026-02-11",
      isOriginal: true,
    },
    {
      fullName: "Sen. Whitmore, Louise B. [R-ME]",
      bioguideId: "PREVIEW-4",
      party: "R",
      state: "ME",
      sponsorshipDate: "2026-03-19",
      isOriginal: false,
    },
  ],
  "119-S-917": [
    {
      fullName: "Sen. Halloran, Peter J. [R-IA]",
      bioguideId: "PREVIEW-7",
      party: "R",
      state: "IA",
      sponsorshipDate: "2026-01-22",
      isOriginal: true,
    },
    {
      fullName: "Rep. Bennett, Marcus T. [D-OH-9]",
      bioguideId: "PREVIEW-1",
      party: "D",
      state: "OH",
      sponsorshipDate: "2026-04-02",
      isOriginal: false,
    },
  ],
  "119-HJRES-66": [
    {
      fullName: "Rep. Dupont, Lauren M. [D-NM-2]",
      bioguideId: "PREVIEW-6",
      party: "D",
      state: "NM",
      sponsorshipDate: "2026-05-06",
      isOriginal: true,
    },
  ],
};

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

// Members.

/**
 * Placeholder members for the fictional sponsors {@link previewBills} already names — a smaller claim than a 535-name
 * roster, which the chamber diagram avoids. Their `PREVIEW-n` IDs fail {@link isBioguideId}, so they're never sent
 * upstream or linked to a real biography, and none has an official website.
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
 * @returns The matching placeholder member, or `undefined` (a 404).
 */
export function findPreviewMemberProfile(bioguideId: string): MemberProfile | undefined {
  const wanted: string = bioguideId.trim().toUpperCase();
  return previewMemberProfiles.find((profile: MemberProfile): boolean => profile.bioguideId === wanted);
}

/**
 * The placeholder members as directory rows, derived from {@link previewMemberProfiles} so the two can't disagree. Some
 * are former members; the route labels the list as placeholders rather than filtering them out.
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
 * The preview bills a placeholder member sponsored, derived from `previewBills` so the two can't disagree.
 *
 * @param bioguideId - The placeholder member's ID, or `undefined` when no member resolved.
 * @returns Their sponsored bills, and an always-empty cosponsored list (no history is invented).
 */
export function previewMemberLegislation(
  bioguideId: string | undefined,
): Pick<MemberProfileResult, "sponsored" | "cosponsored"> {
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

// Chamber composition.

/**
 * The preview chamber diagram's party split: plainly round placeholder counts, not an approximation of any real
 * Congress, which would be a claim this fixture can't keep true.
 */
const previewChamberPartySplits: Record<CongressChamber, PartyTally[]> = {
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
 * Builds one chamber's worth of unattributed "Preview Seat N" placeholders — no invented names, since readers look up
 * their own representative on a chamber diagram.
 *
 * @param chamber - Which chamber to populate.
 * @returns Placeholder members in the party proportions from {@link previewChamberPartySplits}.
 */
function previewChamberMembers(chamber: CongressChamber): CongressMember[] {
  const members: CongressMember[] = [];

  for (const tally of previewChamberPartySplits[chamber]) {
    for (let seat: number = 0; seat < tally.count; seat++) {
      members.push({ name: `Preview Seat ${members.length + 1}`, party: tally.party });
    }
  }

  return members;
}

/**
 * Assembles a clearly labeled placeholder {@link CongressComposition}, for the no-key and upstream-failure paths.
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

// Committees and their records.

/**
 * Placeholder committees, so `/committees` renders without an API key. Named for subjects no real committee covers, so
 * none collides with a real institution, and given system codes that fail `isCommitteeSystemCode`. Spans all three
 * chambers and four committee types to exercise the directory's filters.
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
 * The placeholder committees as directory rows, derived from {@link previewCommitteeProfiles}.
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
 * Locates a preview committee by chamber and system code (chamber is part of its identity). Subcommittees resolve too,
 * promoted to profiles, since parent pages link to them.
 *
 * @param chamber - The raw chamber route param, matched case-insensitively.
 * @param systemCode - The raw system code route param, matched case-insensitively.
 * @returns The matching placeholder committee, or `undefined` (a 404).
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

/** One placeholder committee's three collections. */
type CommitteeRecordSets = {
  /** Bills referred to the committee. */
  bills: CommitteeBillReferral[];
  /** Reports the committee filed. */
  reports: CommitteeReport[];
  /** Nominations referred to it. Empty for House committees. */
  nominations: CommitteeNomination[];
};

/**
 * Placeholder bills, reports, and nominations for the committee pages, keyed by {@link previewCommitteeProfiles}'
 * system codes and sized to match each profile's printed counts.
 *
 * Referrals reuse {@link previewBills} so their links work in preview; one per committee has no bill record, to
 * exercise the failed-title-lookup row. Report and nomination citations carry `PREVIEW` so none can pass as real.
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

/**
 * Builds a placeholder referral around one of the preview bills.
 *
 * @param key - The bill's `billIdentityKey`, e.g., `"119-HR-284"`.
 * @param relationship - What the committee did with it.
 * @param actionDate - When, as an ISO 8601 timestamp.
 * @returns The referral, carrying the preview bill's record — or none, like a failed live title lookup, when the key
 *   names no preview bill.
 */
function previewReferral(key: string, relationship: string, actionDate: string): CommitteeBillReferral {
  const bill: LegislativeBill | undefined = previewBills.find(
    (candidate: LegislativeBill): boolean => billIdentityKey(candidate) === key,
  );
  const [congress = "0", type = "HR", number = "0"]: string[] = key.split("-");

  return { congress: Number(congress), type, number, relationship, actionDate, bill };
}

/**
 * Resolves one page of a placeholder committee's records, paged like the live path so the pager works without a key. An
 * unknown code yields an empty page.
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
