/**
 * The five stages of BillJourney's educational progress cue, in order.
 * Derived from action text by inferBillStage — not an authoritative legal status.
 */
export const billStages = ["introduced", "committee", "chamber", "president", "law"] as const;

export type BillStage = (typeof billStages)[number];

/**
 * Default/expected page size for the bill list endpoint. Lives here (rather than in client.ts, a server-only module) so
 * client components like BillDirectory can reference it too (e.g., to detect a final ("no more bills") page).
 * Congress.gov allows up to 250 per request.
 */
export const DEFAULT_PAGE_SIZE = 12;

/**
 * A bill's natural identifier as it appears in a route (e.g. `/bills/119/hr/284`) — congress, type, and number, all as
 * strings. Shared by every per-bill lookup in client.ts (getBillById, getBillSummaries, getBillTextVersions) and by the
 * bill detail route's own params, so the same three-field shape isn't independently repeated at each site.
 */
export type BillRouteParams = {
  congress: string;
  type: string;
  number: string;
};

/**
 * Builds the "{congress}-{TYPE}-{number}" string that uniquely identifies a bill — used as a React list key, and to
 * look up preview-only fixture content (like `previewSummaries` in fixtures.ts) by a bill's natural identifier. Accepts
 * a numeric `congress` (as `LegislativeBill` itself has) or a string one (as route params have) so both live-data and
 * route-lookup callers can use the same function.
 */
export function billIdentityKey(input: { congress: number | string; type: string; number: string }): string {
  return `${input.congress}-${String(input.type).toUpperCase()}-${input.number}`;
}

/** A bill's primary sponsor. Only present on detail-endpoint lookups — the list endpoint doesn't include it. */
export type BillSponsor = {
  fullName: string;
  party?: string;
  state?: string;
  bioguideId?: string;
};

/**
 * The app's stable internal bill shape.
 * Congress.gov API responses (list or detail) are mapped into this by client.ts before anything else touches them.
 */
export type LegislativeBill = {
  congress: number;
  type: string;
  number: string;
  title: string;
  originChamber: "House" | "Senate" | "Unknown";
  introducedDate?: string;
  latestAction: {
    date?: string;
    text: string;
  };
  policyArea?: string;
  stage: BillStage;
  officialUrl: string;
  sponsor?: BillSponsor;
  cosponsorCount?: number;
};

/**
 * One CRS-written summary of a bill, tied to the legislative stage it describes (`actionDesc`, e.g. "Introduced in
 * House"). Bills can accumulate several of these as they're amended — the most recent describes the bill as it stands
 * now, but earlier ones aren't deleted, since they describe real earlier versions of the text.
 */
export type BillSummary = {
  versionCode: string;
  actionDesc: string;
  actionDate?: string;
  /** A sanitized HTML fragment (see sanitizeSummaryHtml) — safe to render directly. */
  html: string;
};

/** One downloadable rendering (e.g., "Formatted Text", "PDF") of a bill text version, hosted on Congress.gov. */
export type BillTextFormat = {
  type: string;
  url: string;
};

/**
 * One stage-specific version of a bill's actual legislative text (e.g., "Introduced in House", "Engrossed in
 * House").
 */
export type BillTextVersion = {
  type: string;
  date?: string;
  formats: BillTextFormat[];
};

/**
 * Result of a bill-list fetch: the bills themselves, plus whether they're live or preview data and when they were
 * retrieved.
 */
export type CongressSnapshot = {
  bills: LegislativeBill[];
  source: "live" | "preview";
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview" (e.g., no API key, or a transient upstream failure). */
  notice?: string;
};

/** Human-readable labels for each BillStage, used anywhere a stage needs to be displayed. */
export const billStageLabels: Record<BillStage, string> = {
  introduced: "Introduced",
  committee: "In Committee",
  chamber: "Passed a Chamber",
  president: "To the President",
  law: "Became Law",
};
