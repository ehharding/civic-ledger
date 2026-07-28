import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
  type MemberProfile,
  type PartyTally,
} from "@/lib/congress/members";
import type { LegislativeBill } from "@/lib/congress/types";

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
    // A deliberate example of a bill that passed one chamber but never became law — the 116th Congress ended before
    // the House took it up. Illustrates the same "passing one chamber isn't the same as becoming law" point the
    // /learn/how-a-bill-becomes-law lesson makes, but on a real (if fictional) historical record instead of just in
    // the abstract.
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
 * Fictional, illustrative summaries for the preview fixtures, keyed by `billIdentityKey`. Used only when no API key
 * is configured, so a bill's Summary section has something to show instead of an empty box — never presented as a real
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
    sponsored: previewBills.filter((bill: LegislativeBill): boolean => bill.sponsor?.bioguideId === bioguideId),
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
 * Each seat is named "Preview seat N" rather than given a fictional member's name and jurisdiction. A chamber diagram
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
      members.push({ name: `Preview seat ${members.length + 1}`, party: tally.party });
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
