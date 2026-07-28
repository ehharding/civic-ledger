import { formatOrdinal } from "@/lib/format";

/**
 * The five stages of `BillJourney`'s educational progress cue, in order.
 *
 * Derived from a bill's action text by {@link inferBillStage} — an orientation aid, never an authoritative legal
 * status. Ordering matters: `BillJourney` reads a stage's index to decide which steps render as already complete.
 */
export const billStages = ["introduced", "committee", "chamber", "president", "law"] as const;

export type BillStage = (typeof billStages)[number];

/**
 * Page size for the bill list endpoint.
 *
 * Lives here rather than in the server-only adapter so client components can reference it too — `BillDirectory` uses it
 * to recognize a short final page and stop offering "Load More". Congress.gov permits up to 250 per request; this is
 * deliberately much smaller, since it's also the number of cards a person is asked to take in at once.
 */
export const DEFAULT_PAGE_SIZE = 12;

/**
 * A bill's natural identifier as it appears in a route (e.g., `/bills/119/hr/284`) — congress, type, and number, all as
 * strings. Shared by every per-bill lookup in client.ts (getBillById, getBillSummaries, getBillTextVersions) and by the
 * bill detail route's own params, so the same three-field shape isn't independently repeated at each site.
 */
export type BillRouteParams = {
  congress: string;
  type: string;
  number: string;
};

/**
 * Builds the `"{congress}-{TYPE}-{number}"` string that uniquely identifies a bill.
 *
 * Used as a React list key, to look up preview-only fixture content (like `previewSummaries`) by natural identifier,
 * and as the single definition of bill identity across the adapter — so "is this the same bill?" is answered the same
 * way everywhere instead of by three hand-written field comparisons that can drift on case or numeric type.
 *
 * @param input - Anything carrying a bill's natural identifier. Accepts a numeric `congress` (as `LegislativeBill` has)
 *   or a string one (as route params have), and normalizes `type` to upper case, so a live record and a route param
 *   naming the same bill always produce the same key.
 * @returns The identity key, e.g., `"119-HR-284"`.
 */
export function billIdentityKey(input: { congress: number | string; type: string; number: string }): string {
  return `${input.congress}-${String(input.type).toUpperCase()}-${input.number}`;
}

/**
 * Congress.gov's own URL path segment for each bill/resolution type.
 *
 * The public site spells these out in full (`/bill/119th-congress/house-bill/284`) while the API uses short codes
 * (`hr`). Keyed by the upper-cased code, since that's the form `LegislativeBill.type` is normalized to.
 */
const CONGRESS_GOV_BILL_PATHS: Readonly<Record<string, string>> = {
  HR: "house-bill",
  S: "senate-bill",
  HJRES: "house-joint-resolution",
  SJRES: "senate-joint-resolution",
  HCONRES: "house-concurrent-resolution",
  SCONRES: "senate-concurrent-resolution",
  HRES: "house-resolution",
  SRES: "senate-resolution",
};

/** Congress.gov's home page — the honest fallback whenever a specific record's public URL can't be derived. */
export const CONGRESS_GOV_HOME: string = "https://www.congress.gov/";

/**
 * Builds the public Congress.gov page for a bill, e.g., `https://www.congress.gov/bill/119th-congress/house-bill/284`.
 *
 * Derived from the bill's own identity rather than taken from the upstream `url` field, because that field is a
 * *self-referential API* link (`https://api.congress.gov/v3/bill/119/hr/284?format=json`) — sending a reader there
 * hands them raw JSON, or a 403 if they have no key of their own, when what the interface promised was the official
 * record.
 *
 * @param bill - Anything carrying a bill's natural identifier, in either the numeric or string `congress` form.
 * @returns The record's public URL, or {@link CONGRESS_GOV_HOME} for an unrecognized type — a link to the right site
 *   beats a confidently-wrong deep link to a page that doesn't exist.
 */
export function congressGovBillUrl(bill: { congress: number | string; type: string; number: string }): string {
  const typePath: string | undefined = CONGRESS_GOV_BILL_PATHS[String(bill.type).toUpperCase()];
  const congress: number = Number(bill.congress);

  if (!typePath || !Number.isInteger(congress) || congress <= 0) return CONGRESS_GOV_HOME;

  return `https://www.congress.gov/bill/${formatOrdinal(congress)}-congress/${typePath}/${bill.number}`;
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
 * One CRS-written summary of a bill, tied to the legislative stage it describes (`actionDesc`, e.g., "Introduced in
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
