import { compareIsoDatesDesc, formatOrdinal, pluralize } from "@/lib/format";

/**
 * The five stages of `BillJourney`'s educational progress cue, in order.
 *
 * An orientation aid, never an authoritative legal status. Ordering matters twice over: `BillJourney` reads a stage's
 * index to decide which steps render as already complete, and `resolveBillStage` reads it to decide which of two
 * readings is the more advanced.
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
 * strings. Shared by every per-bill lookup in the adapter (`getBillById` and each of the sub-resource reads) and by the
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
 *
 * This map is the single definition of which type codes exist. {@link BILL_TYPE_CODES} and {@link
 * BILL_TYPE_PATH_SEGMENTS} are derived from it rather than restated, so a type Congress.gov adds is added here once
 * instead of in three places that can silently fall out of step — a citation the search box accepts but the URL guard
 * rejects is a bug that only shows up on one specific bill.
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

/**
 * The eight bill/resolution type codes Congress.gov uses, upper-cased — the form `LegislativeBill.type` carries and the
 * form a parsed citation normalizes to. @see CONGRESS_GOV_BILL_PATHS, from which this is derived.
 */
export const BILL_TYPE_CODES: ReadonlySet<string> = new Set<string>(Object.keys(CONGRESS_GOV_BILL_PATHS));

/**
 * The same eight codes, lower-cased — the form Congress.gov's *API* path segments take (`/bill/119/hr/284`), which is
 * what the outbound-URL guard in `http.ts` matches against.
 */
export const BILL_TYPE_PATH_SEGMENTS: ReadonlySet<string> = new Set<string>(
  Object.keys(CONGRESS_GOV_BILL_PATHS).map((code: string): string => code.toLowerCase()),
);

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

/**
 * A reference to one recorded (roll-call) vote taken on a bill.
 *
 * Deliberately a *reference* and not a tally. This app holds no vote counts and no member positions: what it carries is
 * the chamber, the roll number, when it happened, and the link to the chamber's own record — enough for a reader to
 * find the vote, which is the thing the official source answers better than any copy of it could.
 * @see docs/data-policy.md.
 */
export type RecordedVote = {
  chamber: "House" | "Senate";
  /** The chamber's own sequential number for the vote within a session, e.g., `190`. */
  rollNumber: number;
  congress: number;
  /** 1 or 2 — which of the Congress's two annual sessions the vote fell in. Absent on a few older records. */
  sessionNumber?: number;
  date?: string;
  /** The chamber's official tally (clerk.house.gov or senate.gov), verbatim from Congress.gov. */
  url: string;
};

/**
 * One entry in a bill's action history.
 *
 * Every field except `text` is optional because the endpoint reports the same event from several source systems at
 * once, and the rows differ in what they carry: only the Library of Congress rows have the standardized `actionCode`
 * that {@link inferStageFromActions} reads, while the chamber floor systems carry the fuller prose.
 */
export type BillAction = {
  date?: string;
  text: string;
  /** Congress.gov's own classification of the action — `"IntroReferral"`, `"Committee"`, `"Floor"`, `"BecameLaw"`, … */
  type?: string;
  /** The Library of Congress action code, when this row came from that system. @see inferStageFromActions */
  actionCode?: string;
  /** Roll-call votes this action records. Empty for the overwhelming majority of actions. */
  recordedVotes: RecordedVote[];
};

/**
 * The law a bill became, exactly as Congress.gov states it on the bill's own record.
 *
 * This is the one fact on a bill that inference cannot settle. Both stage classifiers — the prose one and the
 * action-code one — answer "did this become law?" by recognizing something, and a recognizer that doesn't recognize is
 * indistinguishable from a bill that didn't pass. The `laws` field is the record saying so outright, and it carries the
 * citation ("Public Law 119-21") that neither classifier could have produced at all.
 *
 * Detail-endpoint only, like {@link BillSponsor} and the cosponsor count — the bill *list* endpoint omits it, which is
 * why the prose classifier still earns its place on a directory card.
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
 * In the model rather than at the view on the rule the rest of this layer follows: the two halves of a citation are
 * joined in exactly one place, so a page and a share card can't spell the same law differently.
 *
 * @param law - The law to name.
 * @returns The full citation.
 */
export function formatEnactedLaw(law: EnactedLaw): string {
  return `${law.type} ${law.number}`;
}

/**
 * Congress.gov's own counts for the four collections hanging off a bill.
 *
 * Read rather than inferred from the arrays this app fetched, on the rule that governs `laws` and `legislationUrl`
 * alike: a figure the publisher states is not the same kind of thing as a figure this app arrived at, and a sentence
 * beginning "Congress.gov records…" is only true of the first. The two agree on nearly every bill, which is exactly why
 * the difference is worth carrying — a claim that is usually right is the kind that goes wrong unnoticed.
 *
 * They can diverge in two ways, and the page's wording covers both without needing to know which happened: a row the
 * mapper declined (an action with no text is not a row) drops the shown figure by one, and a collection longer than the
 * single 250-record page this app requests drops it by more.
 *
 * Detail-endpoint only, like {@link BillSponsor} and {@link EnactedLaw} — a directory card counts nothing, so the list
 * endpoint's silence here costs nothing. @see describeBillCollection for how a section states the pair.
 */
export type BillCollectionCounts = {
  actions?: number;
  committees?: number;
  summaries?: number;
  textVersions?: number;
  relatedBills?: number;
};

/**
 * The two figures Congress.gov publishes about a bill's cosponsors.
 *
 * Separate from {@link BillCollectionCounts} because it is not one number, and the second one is not decoration. The
 * `/cosponsors` collection lists whoever is *currently* signed on; `includingWithdrawn` counts everyone who ever was.
 * Where they differ, a member took their name off the bill — an event with no other trace anywhere on this page, since
 * the withdrawing member is by then absent from the very list a reader would check.
 *
 * Carried as a pair so the page can never state one without being able to check the other.
 * @see describeWithdrawnCosponsors
 */
export type BillCosponsorTally = {
  /** How many are signed on now. */
  current?: number;
  /** How many have been at any point, withdrawals included. Equal to `current` on nearly every bill. */
  includingWithdrawn?: number;
};

/**
 * States that cosponsors withdrew, when the two published figures say so.
 *
 * The subtraction is this app's, but both operands are Congress.gov's and the sentence says what it did rather than
 * presenting the difference as a published fact. Returns an empty string whenever the figures agree, either is missing,
 * or the difference is negative — the last of which should not happen and is not worth a confident sentence if it does.
 *
 * @param tally - The bill's two cosponsor figures.
 * @returns The sentence, or an empty string when there is nothing to say.
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
 * States how many of a bill's cosponsors were on it at introduction.
 *
 * The one figure the cosponsor section computes rather than reads, so the wording is careful about whose number it is:
 * it counts a boolean Congress.gov publishes on each row, and says "of the names below" rather than "on this bill",
 * because the list it describes is the one on screen and not necessarily the whole collection.
 *
 * In the model rather than at the view, on the rule the rest of this layer follows — display wording belongs somewhere
 * a unit test can reach without rendering a page.
 * @see describeBillCollection.
 *
 * @param originals - How many of the listed cosponsors the record marks as original.
 * @param total - How many are listed.
 * @returns The sentence, or an empty string when there is nothing listed to describe.
 */
export function describeOriginalCosponsors(originals: number, total: number): string {
  if (total === 0) return "";
  if (originals === 0) return "None of the names below were on the bill when it was introduced.";

  const wereOn: string = `${originals} of the names below ${pluralize(originals, "was", "were")} on the bill when it was introduced`;

  // "…; the rest joined later" is false when there is no rest, which is the common shape for a bill with two or three
  // cosponsors — so the all-original case gets its own ending rather than a clause that contradicts the count.
  if (originals === total) return `Every one of them — all ${total} — was on the bill when it was introduced.`;

  const later: number = total - originals;

  return `${wereOn}; the other ${later} joined later.`;
}

/**
 * One member who put their name to a bill they did not introduce.
 *
 * Everything here is published rather than derived — including {@link isOriginal}, which is the distinction that makes
 * the collection worth listing rather than counting. A member on the bill the day it was introduced and one who joined
 * eight months later are both cosponsors, and only the record separates them.
 */
export type BillCosponsor = {
  /** The name as Congress.gov spells it, e.g., `"Rep. Issa, Darrell [R-CA-48]"`. */
  fullName: string;
  /** Present on essentially every live record; its absence is what makes a cosponsor unlinkable rather than unusable. */
  bioguideId?: string;
  party?: string;
  state?: string;
  /** When they signed on. */
  sponsorshipDate?: string;
  /** Set only for the rare member who later took their name off. */
  withdrawnDate?: string;
  /** Whether they were on the bill at introduction, as the record states it — never inferred from dates. */
  isOriginal: boolean;
};

/**
 * How one measure relates to another, and who said it does.
 *
 * The attribution is not optional decoration. A relationship between two bills is an editorial judgment rather than a
 * legislative act — the Congressional Research Service, the House, and the Senate each identify their own — so the page
 * prints who made the call beside the call itself, on the same rule that keeps this app's stage cue labeled as a
 * reading rather than a status.
 */
export type RelatedBillRelationship = {
  /** e.g., `"Related bill"`, `"Identical bill"`, `"Procedurally-related"`. */
  type: string;
  /** e.g., `"CRS"`, `"House"`, `"Senate"`. */
  identifiedBy?: string;
};

/**
 * Another measure this bill is recorded as related to.
 *
 * A reference, not a bill: it carries what a link and a label need and nothing else, which is all the endpoint sends.
 * The identity fields are required rather than optional because a related bill this app cannot open is worse than one
 * it does not list — the same rule that drops a recorded vote missing its roll number.
 * @see mapRelatedBill
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
  /** Every recorded statement of how the two measures relate. Can be empty when the record named none. */
  relationships: RelatedBillRelationship[];
};

/**
 * States how many records a bill's collection holds, attributing the figure to whoever actually produced it.
 *
 * The distinction this exists to keep is a small one to write and an easy one to lose: "Congress.gov records 59
 * actions" is a claim about the congressional record, and "this page shows 59 actions" is a claim about this page. The
 * first sentence may only ever be built from a published figure.
 *
 * In the model rather than at the view, on the rule the rest of this layer follows — what a reader is told is display
 * wording, so it belongs somewhere a unit test can reach without rendering a page.
 *
 * @param options - How many records are on screen, how many the publisher counted (absent on a preview or failed
 *   read), the singular noun for the thing being counted, and its plural where an `s` won't do.
 * @returns The sentence. Where the two figures agree the count is attributed to Congress.gov and the page's own tally
 *   goes unmentioned; where they differ both are named, since the gap is itself a fact about the record; and where
 *   Congress.gov published no count the sentence claims only what this page is showing. An empty string for a
 *   collection with nothing in it and nothing published, which the caller renders as its own "none on file" line.
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

  // Phrased as two clauses with two subjects rather than "…; 58 of them are shown", which both reads as a subordinate
  // detail and forces the verb to agree with a number that can be 1. Naming this page in its own clause is the whole
  // distinction the function exists to draw, so it gets its own subject.
  return shown === published ? `${recorded}.` : `${recorded}; this page shows ${shown}.`;
}

/** A bill's primary sponsor. Only present on detail-endpoint lookups — the list endpoint doesn't include it. */
export type BillSponsor = {
  fullName: string;
  party?: string;
  state?: string;
  bioguideId?: string;
};

/**
 * The app's stable internal bill shape. Congress.gov API responses (list or detail) are mapped into this by
 * `mapCongressBill` in `mappers.ts` before anything else touches them.
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
   * Where the bill has got to. Established by {@link enactedLaw} where the record publishes one, and inferred from the
   * latest action's prose otherwise. @see inferBillStage, and `resolveBillStage` for what the bill's own page does with
   * this once the full action history is in hand.
   */
  stage: BillStage;
  officialUrl: string;
  sponsor?: BillSponsor;
  /**
   * How many members put their name to the bill, as a pair rather than a number.
   *
   * Detail-endpoint only, like {@link BillSponsor} and {@link EnactedLaw}. @see BillCosponsorTally for why the
   * withdrawn figure travels alongside the current one instead of being dropped as a near-duplicate.
   */
  cosponsorTally?: BillCosponsorTally;
  /** Set only for an enacted measure, and only from the detail endpoint. @see EnactedLaw */
  enactedLaw?: EnactedLaw;
  /**
   * Congress.gov's own sizes for the collections the bill page fetches separately.
   *
   * Absent whenever the record came from the list endpoint, from a preview fixture, or from a detail response that
   * published no counts at all — in every one of those cases the page states what it is showing instead of attributing
   * a figure to a publisher that did not supply one. @see BillCollectionCounts
   */
  collectionCounts?: BillCollectionCounts;
};

/**
 * Orders bills most-recently-introduced first.
 *
 * Compares `introducedDate`, falling back to the latest action's date for a record that carries no introduction date —
 * which is rare, but a bill sorted to an arbitrary position is worse than one sorted by the only date it has.
 *
 * The comparison itself is {@link compareIsoDatesDesc}, which this shares with every other date-ordered list in the
 * app. All this adds is which of a bill's two dates to hand it.
 *
 * @param a - One bill to compare.
 * @param b - The other bill to compare.
 * @returns A standard comparator result. Bills with no usable date at all sort last, together, rather than ahead of
 *   everything dated.
 */
export function compareBillsByRecency(a: LegislativeBill, b: LegislativeBill): number {
  const dateA: string = a.introducedDate ?? a.latestAction.date ?? "";
  const dateB: string = b.introducedDate ?? b.latestAction.date ?? "";

  return compareIsoDatesDesc(dateA, dateB);
}

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
 * One stage-specific version of a bill's actual legislative text (e.g., "Introduced in House", "Engrossed in House").
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
