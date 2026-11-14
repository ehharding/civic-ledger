import { compareIsoDatesDesc, formatOrdinal, pluralize } from "@/lib/format";

/**
 * The five stages of `BillJourney`'s progress cue, in order — an orientation aid, never a legal status. Order matters:
 * `BillJourney` and `resolveBillStage` both compare stages by index.
 */
export const billStages = ["introduced", "committee", "chamber", "president", "law"] as const;

export type BillStage = (typeof billStages)[number];

/**
 * Page size for the bill list endpoint. Here rather than in the server-only adapter so `BillDirectory` can recognize a
 * short final page. Congress.gov allows 250; this is sized for how many cards a reader takes in at once.
 */
export const DEFAULT_PAGE_SIZE = 12;

/** A bill's natural identifier as route params (e.g., `/bills/119/hr/284`), shared by every per-bill lookup. */
export type BillRouteParams = {
  congress: string;
  type: string;
  number: string;
};

/**
 * Builds the `"{congress}-{TYPE}-{number}"` key that is the single definition of bill identity — used as a React key,
 * for fixture lookups, and anywhere the adapter asks "is this the same bill?".
 *
 * @param input - A bill's natural identifier. `congress` may be numeric or a string and `type` is upper-cased, so a
 *   live record and a route param naming the same bill produce the same key.
 * @returns The identity key, e.g., `"119-HR-284"`.
 */
export function billIdentityKey(input: { congress: number | string; type: string; number: string }): string {
  return `${input.congress}-${String(input.type).toUpperCase()}-${input.number}`;
}

/**
 * Congress.gov's public URL path segment for each bill type, keyed by the upper-cased API code. The single definition
 * of which type codes exist: {@link BILL_TYPE_CODES} and {@link BILL_TYPE_PATH_SEGMENTS} derive from it.
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

/** The eight bill type codes, upper-cased — the form `LegislativeBill.type` and parsed citations use. */
export const BILL_TYPE_CODES: ReadonlySet<string> = new Set<string>(Object.keys(CONGRESS_GOV_BILL_PATHS));

/** The same codes lower-cased, as API path segments (`/bill/119/hr/284`); the outbound-URL guard matches these. */
export const BILL_TYPE_PATH_SEGMENTS: ReadonlySet<string> = new Set<string>(
  Object.keys(CONGRESS_GOV_BILL_PATHS).map((code: string): string => code.toLowerCase()),
);

/** Congress.gov's home page — the fallback whenever a record's public URL can't be derived. */
export const CONGRESS_GOV_HOME: string = "https://www.congress.gov/";

/**
 * Builds the public Congress.gov page for a bill, e.g., `https://www.congress.gov/bill/119th-congress/house-bill/284`.
 *
 * Derived rather than taken from the upstream `url`, which is an API link that serves JSON (or a 403 without a key).
 *
 * @param bill - A bill's natural identifier, with a numeric or string `congress`.
 * @returns The record's public URL, or {@link CONGRESS_GOV_HOME} for an unrecognized type or Congress.
 */
export function congressGovBillUrl(bill: { congress: number | string; type: string; number: string }): string {
  const typePath: string | undefined = CONGRESS_GOV_BILL_PATHS[String(bill.type).toUpperCase()];
  const congress: number = Number(bill.congress);

  if (!typePath || !Number.isInteger(congress) || congress <= 0) return CONGRESS_GOV_HOME;

  return `https://www.congress.gov/bill/${formatOrdinal(congress)}-congress/${typePath}/${bill.number}`;
}

/**
 * Congress.gov's public URL path segment for each amendment type. The API publishes only these two codes; anything else
 * falls back to {@link CONGRESS_GOV_HOME}.
 */
const CONGRESS_GOV_AMENDMENT_PATHS: Readonly<Record<string, string>> = {
  HAMDT: "house-amendment",
  SAMDT: "senate-amendment",
};

/**
 * Builds the public Congress.gov page for an amendment, e.g.,
 * `https://www.congress.gov/amendment/119th-congress/senate-amendment/2849`.
 *
 * Derived for the same reason as {@link congressGovBillUrl}. The pattern matches the URL Congress.gov publishes on each
 * amendment's own record, which isn't fetched at runtime because that would cost a request per amendment.
 *
 * @param amendment - An amendment's natural identifier, with a numeric or string `congress`.
 * @returns The amendment's public URL, or {@link CONGRESS_GOV_HOME} for an unrecognized type or Congress.
 */
export function congressGovAmendmentUrl(amendment: {
  congress: number | string;
  type: string;
  number: string;
}): string {
  const typePath: string | undefined = CONGRESS_GOV_AMENDMENT_PATHS[String(amendment.type).toUpperCase()];
  const congress: number = Number(amendment.congress);

  if (!typePath || !Number.isInteger(congress) || congress <= 0) return CONGRESS_GOV_HOME;

  return `https://www.congress.gov/amendment/${formatOrdinal(congress)}-congress/${typePath}/${amendment.number}`;
}

/**
 * One amendment offered to a bill, as the bill's `/amendments` collection records it.
 *
 * Only the identity fields are required: the endpoint sends anything more for roughly one entry in fifteen
 * (@see congressApiBillAmendmentSchema), so an amendment row is usually just a citation and a link.
 */
export type BillAmendment = {
  congress: number;
  /** The upper-cased type code, `"HAMDT"` or `"SAMDT"`. @see CONGRESS_GOV_AMENDMENT_PATHS */
  type: string;
  number: string;
  /** What the amendment says it does. The record's `purpose`, falling back to its `description`. Usually absent. */
  purpose?: string;
  /** The amendment's own latest action, when the entry carried one with text. */
  latestAction?: {
    date?: string;
    text: string;
  };
  /** The amendment's public Congress.gov page. @see congressGovAmendmentUrl */
  officialUrl: string;
};

/** How amendment codes are cited in prose — the form a reader will find on Congress.gov ("S.Amdt. 2849"). */
const AMENDMENT_TYPE_CITATIONS: Readonly<Record<string, string>> = {
  HAMDT: "H.Amdt.",
  SAMDT: "S.Amdt.",
};

/**
 * How an amendment is cited on screen, e.g., `"S.Amdt. 2849"`.
 *
 * @param amendment - The amendment to cite.
 * @returns The citation. An unrecognized type shows the code as published rather than a guessed abbreviation.
 */
export function formatAmendmentCitation(amendment: Pick<BillAmendment, "type" | "number">): string {
  return `${AMENDMENT_TYPE_CITATIONS[amendment.type] ?? amendment.type} ${amendment.number}`;
}

/**
 * A reference to one recorded (roll-call) vote on a bill — enough to find it, never a tally. This app holds no vote
 * counts or member positions. @see docs/data-policy.md.
 */
export type RecordedVote = {
  chamber: "House" | "Senate";
  /** The chamber's sequential number for the vote within a session, e.g., `190`. */
  rollNumber: number;
  congress: number;
  /** 1 or 2 — which annual session the vote fell in. Absent on a few older records. */
  sessionNumber?: number;
  date?: string;
  /** The chamber's official tally (clerk.house.gov or senate.gov), verbatim from Congress.gov. */
  url: string;
};

/**
 * One entry in a bill's action history.
 *
 * The endpoint reports each event from several source systems, which carry different fields: only Library of Congress
 * rows have the `actionCode` {@link inferStageFromActions} reads.
 */
export type BillAction = {
  date?: string;
  text: string;
  /** Congress.gov's classification — `"IntroReferral"`, `"Committee"`, `"Floor"`, `"BecameLaw"`, … */
  type?: string;
  /** The Library of Congress action code, when this row came from that system. @see inferStageFromActions */
  actionCode?: string;
  /** Roll-call votes this action records. Usually empty. */
  recordedVotes: RecordedVote[];
};

/**
 * The law a bill became, as Congress.gov states it. The one stage fact that needs no inference, and the only source of
 * the citation ("Public Law 119-21"). Detail endpoint only.
 */
export type EnactedLaw = {
  /** `"Public Law"` or `"Private Law"`, verbatim. */
  type: string;
  /** The citation number, e.g., `"119-21"` — the Congress, then the measure's sequence within it. */
  number: string;
};

/**
 * How an enacted law reads on screen, e.g., `"Public Law 119-21"`.
 *
 * @param law - The law to name.
 * @returns The full citation.
 */
export function formatEnactedLaw(law: EnactedLaw): string {
  return `${law.type} ${law.number}`;
}

/**
 * Says how many listed amendments carry any purpose text. Congress.gov publishes one for roughly one in fifteen, so
 * this tells the reader the sparseness is the record's, not this page's.
 *
 * @param described - How many of the listed amendments carry a purpose.
 * @param total - How many are listed.
 * @returns The sentence, or an empty string when nothing is listed.
 */
export function describeAmendmentDetail(described: number, total: number): string {
  if (total === 0) return "";
  if (described === 0) {
    return "Congress.gov publishes no purpose text for any of them here, so each row is the amendment's citation and a link to its own record.";
  }
  if (described === total) return "Each carries the purpose the record states for it.";

  return `${described} of them carry the purpose the record states; the rest are published here as citations only, with their text on the amendment's own record.`;
}

/**
 * Congress.gov's own counts for the collections hanging off a bill. Read rather than inferred from the fetched arrays,
 * because only a published figure can back a sentence beginning "Congress.gov records…". The two can differ when the
 * mapper drops an unusable row or a collection exceeds the single 250-record page this app requests.
 *
 * Detail endpoint only. @see describeBillCollection.
 */
export type BillCollectionCounts = {
  actions?: number;
  committees?: number;
  summaries?: number;
  textVersions?: number;
  relatedBills?: number;
  /** Often larger than the 250 this app fetches on heavily amended bills. */
  amendments?: number;
};

/**
 * The two cosponsor figures Congress.gov publishes. The list holds who is signed on now; `includingWithdrawn` counts
 * everyone who ever was — the only trace a withdrawal leaves. @see describeWithdrawnCosponsors
 */
export type BillCosponsorTally = {
  /** How many are signed on now. */
  current?: number;
  /** How many have been at any point, withdrawals included. */
  includingWithdrawn?: number;
};

/**
 * States that cosponsors withdrew, when the two published figures say so.
 *
 * @param tally - The bill's two cosponsor figures.
 * @returns The sentence, or an empty string when the figures agree, either is missing, or the difference is negative.
 */
export function describeWithdrawnCosponsors(tally: BillCosponsorTally | undefined): string {
  const { current, includingWithdrawn } = tally ?? {};
  if (current === undefined || includingWithdrawn === undefined) return "";

  const withdrawn: number = includingWithdrawn - current;
  if (withdrawn <= 0) return "";

  return `${withdrawn} more ${pluralize(withdrawn, "member")} cosponsored this bill and later withdrew, so ${
    withdrawn === 1 ? "that name is" : "those names are"
  } counted by Congress.gov but absent from the list below.`;
}

/**
 * States how many listed cosponsors were on the bill at introduction. It counts a published per-row flag, and says "of
 * the names below" because it describes the list on screen, not necessarily the whole collection.
 *
 * @param originals - How many of the listed cosponsors the record marks as original.
 * @param total - How many are listed.
 * @returns The sentence, or an empty string when nothing is listed.
 */
export function describeOriginalCosponsors(originals: number, total: number): string {
  if (total === 0) return "";
  if (originals === 0) return "None of the names below were on the bill when it was introduced.";

  const wereOn: string = `${originals} of the names below ${pluralize(originals, "was", "were")} on the bill when it was introduced`;

  // "the rest joined later" would be false when there is no rest.
  if (originals === total) return `Every one of them — all ${total} — was on the bill when it was introduced.`;

  const later: number = total - originals;

  return `${wereOn}; the other ${later} joined later.`;
}

/** One member who put their name to a bill they did not introduce. Every field is published, none derived. */
export type BillCosponsor = {
  /** The name as Congress.gov spells it, e.g., `"Rep. Issa, Darrell [R-CA-48]"`. */
  fullName: string;
  /** Present on essentially every live record; without it the cosponsor can't be linked. */
  bioguideId?: string;
  party?: string;
  state?: string;
  /** When they signed on. */
  sponsorshipDate?: string;
  /** Set only for a member who later took their name off. */
  withdrawnDate?: string;
  /** Whether they were on the bill at introduction, as the record states — never inferred from dates. */
  isOriginal: boolean;
};

/**
 * How one measure relates to another, and who said so. A relationship is an editorial judgment (CRS, the House, and the
 * Senate each identify their own), so the page shows the attribution beside it.
 */
export type RelatedBillRelationship = {
  /** e.g., `"Related bill"`, `"Identical bill"`, `"Procedurally-related"`. */
  type: string;
  /** e.g., `"CRS"`, `"House"`, `"Senate"`. */
  identifiedBy?: string;
};

/**
 * Another measure this bill is recorded as related to — a reference carrying what a link and label need. Identity
 * fields are required because a related bill that can't be opened isn't listed. @see mapRelatedBill
 */
export type RelatedBill = {
  congress: number;
  type: string;
  number: string;
  title: string;
  latestAction?: {
    date?: string;
    text: string;
  };
  /** Every recorded statement of how the two measures relate. Can be empty. */
  relationships: RelatedBillRelationship[];
};

/**
 * States how many records a bill's collection holds, attributing the figure to whoever produced it: "Congress.gov
 * records…" only for a published count, "this page shows…" for this app's own.
 *
 * @param options - How many records are on screen, how many the publisher counted (absent on a preview or failed read),
 *   the singular noun, and its plural where an `s` won't do.
 * @returns The sentence: the published count alone when the two agree, both when they differ, only the shown count when
 *   nothing was published, or an empty string when there's nothing either way.
 */
export function describeBillCollection(options: {
  shown: number;
  published?: number;
  noun: string;
  pluralNoun?: string;
}): string {
  const { shown, published, noun, pluralNoun } = options;

  if (published === undefined) {
    if (shown === 0) return "";
    return `This page shows ${shown} ${pluralize(shown, noun, pluralNoun)} for this bill.`;
  }

  const recorded: string = `Congress.gov records ${published} ${pluralize(published, noun, pluralNoun)} on this bill`;

  return shown === published ? `${recorded}.` : `${recorded}; this page shows ${shown}.`;
}

/** A bill's primary sponsor. Detail endpoint only. */
export type BillSponsor = {
  fullName: string;
  party?: string;
  state?: string;
  bioguideId?: string;
};

/**
 * What `latestAction.text` says when Congress.gov published no action prose. The field is required so no card shows a
 * blank line; this constant lets the one place that must tell the two apart (the bill page's share description) do so.
 * Assigned only by {@link mapCongressBill}.
 */
export const NO_LATEST_ACTION_TEXT: string = "No action text has been published yet.";

/**
 * The app's stable internal bill shape. Every Congress.gov response is mapped into this by `mapCongressBill` in
 * `upstream/mappers.ts` before anything else touches it.
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
  /**
   * Where the bill has got to: from {@link enactedLaw} when published, otherwise inferred from the latest action.
   * @see inferBillStage, and `resolveBillStage` for the bill page's reading from the full action history.
   */
  stage: BillStage;
  officialUrl: string;
  sponsor?: BillSponsor;
  /** Detail endpoint only. @see BillCosponsorTally */
  cosponsorTally?: BillCosponsorTally;
  /** Set only for an enacted measure, from the detail endpoint. @see EnactedLaw */
  enactedLaw?: EnactedLaw;
  /**
   * Congress.gov's sizes for the collections the bill page fetches separately. Absent for list-endpoint records,
   * preview fixtures, and detail responses without counts. @see BillCollectionCounts
   */
  collectionCounts?: BillCollectionCounts;
};

/**
 * Orders bills most-recently-introduced first — a bill's age, as a member's sponsored list wants. Falls back to the
 * latest action's date; undated bills sort last.
 *
 * @param a - One bill to compare.
 * @param b - The other bill to compare.
 * @returns A standard comparator result.
 */
export function compareBillsByRecency(a: LegislativeBill, b: LegislativeBill): number {
  const dateA: string = a.introducedDate ?? a.latestAction.date ?? "";
  const dateB: string = b.introducedDate ?? b.latestAction.date ?? "";

  return compareIsoDatesDesc(dateA, dateB);
}

/**
 * Orders bills most-recently-*acted-on* first — whether anything is happening, as the home page's "Latest Activity"
 * wants. Falls back to the introduction date; undated bills sort last.
 *
 * Sorted here because the list endpoint only sorts by `updateDate`, a maintenance timestamp that merely correlates with
 * legislative activity. @see docs/architecture.md, "compareIsoDatesDesc — one date order".
 *
 * @param a - One bill to compare.
 * @param b - The other bill to compare.
 * @returns A standard comparator result.
 */
export function compareBillsByActivity(a: LegislativeBill, b: LegislativeBill): number {
  const dateA: string = a.latestAction.date ?? a.introducedDate ?? "";
  const dateB: string = b.latestAction.date ?? b.introducedDate ?? "";

  return compareIsoDatesDesc(dateA, dateB);
}

/**
 * One CRS summary of a bill, tied to the stage it describes (`actionDesc`, e.g., "Introduced in House"). A bill can
 * have several; earlier ones describe earlier versions of the text.
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

/** One stage-specific version of a bill's text (e.g., "Introduced in House", "Engrossed in House"). */
export type BillTextVersion = {
  type: string;
  date?: string;
  formats: BillTextFormat[];
};

/** Result of a bill-list fetch: the bills, whether they're live or preview, and when they were retrieved. */
export type CongressSnapshot = {
  bills: LegislativeBill[];
  source: "live" | "preview";
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview" (no API key, or an upstream failure). */
  notice?: string;
};

/** Display labels for each BillStage. */
export const billStageLabels: Record<BillStage, string> = {
  introduced: "Introduced",
  committee: "In Committee",
  chamber: "Passed a Chamber",
  president: "To the President",
  law: "Became Law",
};
