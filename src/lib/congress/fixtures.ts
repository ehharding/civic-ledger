import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
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
    sponsor: { fullName: "Rep. Bennett, Marcus T. [D-OH-9]", party: "D", state: "OH" },
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
    sponsor: { fullName: "Sen. Alvarez, Priya R. [R-AZ]", party: "R", state: "AZ" },
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
    sponsor: { fullName: "Rep. Okafor, Daniel K. [D-GA-4]", party: "D", state: "GA" },
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
    sponsor: { fullName: "Sen. Whitmore, Louise B. [R-ME]", party: "R", state: "ME" },
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
    sponsor: { fullName: "Rep. Castillo, Ana P. [D-TX-20]", party: "D", state: "TX" },
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
    sponsor: { fullName: "Rep. Dupont, Lauren M. [D-NM-2]", party: "D", state: "NM" },
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
    sponsor: { fullName: "Sen. Halloran, Peter J. [R-IA]", party: "R", state: "IA" },
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
