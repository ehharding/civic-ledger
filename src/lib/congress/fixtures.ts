import type { LegislativeBill } from "@/lib/congress/types";

/**
 * Clearly labeled fixture records let the application render without a key.
 * They are not real legislative records and must not be represented as live data.
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
];

/**
 * The first preview fixture, as a plain (never-undefined) reference — a convenience for tests exercising a single
 * representative bill.
 */
export const firstPreviewBill: LegislativeBill = previewBills[0] as LegislativeBill;

/**
 * Builds the "{congress}-{TYPE}-{number}" key used to look up preview-only fixture content (like `previewSummaries`) by
 * a bill's natural identifier. Exported so client.ts can build the same key from a route's raw congress/type/number
 * strings without duplicating the format here.
 */
export function billIdentityKey(input: { congress: number | string; type: string; number: string }): string {
  return `${input.congress}-${String(input.type).toUpperCase()}-${input.number}`;
}

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
};
