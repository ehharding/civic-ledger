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
