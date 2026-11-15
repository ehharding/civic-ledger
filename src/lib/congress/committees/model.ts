import { compareText } from "@/lib/format";

/**
 * The committee domain model, built on the same rules as `members/model.ts`: upstream free text is narrowed at the
 * boundary, display wording lives here so it can be unit-tested, and nothing performs I/O (the browser imports this to
 * filter the directory).
 */

/**
 * The chambers a committee can belong to — `CongressChamber` plus "joint", for bodies like the Joint Economic
 * Committee. Also the path segments Congress.gov's committee endpoint accepts, so they go into routes unchanged.
 */
export const committeeChambers = ["house", "senate", "joint"] as const;

export type CommitteeChamber = (typeof committeeChambers)[number];

/**
 * Full chamber names, for headings and prose.
 *
 * The joint label names the *membership* rather than repeating the word "Joint", because it is read beside the
 * committee's type: a joint committee's eyebrow would otherwise say "Joint Committee · Joint Committee of Congress".
 */
export const committeeChamberLabels: Record<CommitteeChamber, string> = {
  house: "House of Representatives",
  senate: "Senate",
  joint: "Both Chambers of Congress",
};

/** Short chamber names, for the directory's chamber filter and other tight spaces. */
export const committeeChamberShortLabels: Record<CommitteeChamber, string> = {
  house: "House",
  senate: "Senate",
  joint: "Joint",
};

/**
 * Narrows Congress.gov's committee `chamber` string to a {@link CommitteeChamber}.
 *
 * @param chamber - The upstream chamber string ("House", "Senate", "Joint", or "NoChamber"), if any.
 * @returns The matching chamber, or `null` for anything unrecognized (including `"NoChamber"`), so callers drop it.
 */
export function normalizeCommitteeChamber(chamber?: string): CommitteeChamber | null {
  const value: string = (chamber ?? "").trim().toLowerCase();

  if (value === "house" || value === "house of representatives") return "house";
  if (value === "senate") return "senate";
  if (value === "joint") return "joint";

  return null;
}

/**
 * The kinds of committee this app groups by. Congress.gov's eight `committeeTypeCode` values collapse to five:
 * "Special" and "Select" mean the same thing in the two chambers, "Task Force" joins "Other", and anything unknown is
 * `"other"`. "Subcommittee" is absent because that's modeled structurally. @see CommitteeSummary.parent
 */
export const committeeTypes = ["standing", "select", "joint", "commission", "other"] as const;

export type CommitteeType = (typeof committeeTypes)[number];

/** How each type reads in a sentence, which differs from its chip label (e.g., "Other" isn't a noun phrase). */
export const committeeTypeNounPhrases: Record<CommitteeType, string> = {
  standing: "Standing committee",
  select: "Select committee",
  joint: "Joint committee",
  commission: "Commission or caucus",
  other: "Committee",
};

/** How each committee type reads on screen. */
export const committeeTypeLabels: Record<CommitteeType, string> = {
  standing: "Standing",
  select: "Select or Special",
  joint: "Joint",
  commission: "Commission or Caucus",
  other: "Other",
};

/** One sentence on what each kind of committee *is* — e.g., whether it's permanent or convened for one purpose. */
export const committeeTypeDescriptions: Record<CommitteeType, string> = {
  standing:
    "A permanent committee, created by a chamber's own rules. Standing committees hold jurisdiction over a subject area for as long as the rules stand, and are where most bills are referred.",
  select:
    "A committee convened for a specific purpose or period, usually to investigate or study something a standing committee's jurisdiction does not cleanly cover. Some are renewed for decades; most are not.",
  joint:
    "A committee drawn from both chambers, sitting together. Joint committees generally study and report rather than take up legislation of their own.",
  commission:
    "A commission or caucus recorded alongside the committees, rather than a committee of either chamber. These vary widely in what they do and what authority they carry.",
  other: "Congress.gov records this body among the committees without placing it in one of its named categories.",
};

/**
 * Narrows Congress.gov's `committeeTypeCode` to a {@link CommitteeType}. Matches loosely, since spacing and casing vary
 * across endpoints ("Commission or Caucus" vs "commission").
 *
 * @param type - The upstream `committeeTypeCode` or `type`, if any.
 * @returns The matching type, or `"other"` for anything unrecognized.
 */
export function normalizeCommitteeType(type?: string): CommitteeType {
  const value: string = (type ?? "").trim().toLowerCase();

  if (value.startsWith("standing")) return "standing";
  if (value.startsWith("select") || value.startsWith("special")) return "select";
  if (value.startsWith("joint")) return "joint";
  if (value.startsWith("commission") || value.startsWith("caucus")) return "commission";

  return "other";
}

/**
 * The shape of a Congress.gov committee system code, e.g. `"hsag00"` (House Agriculture) or `"hsag14"` (a
 * subcommittee). Guards the route and official-record references; preview fixture codes deliberately can't match.
 * Looser than the observed four-letters-two-digits form: its job is safe interpolation, not rejecting real codes.
 */
const SYSTEM_CODE_PATTERN: RegExp = /^[a-z]{2,8}\d{2}$/;

/**
 * Whether `value` is a well-formed committee system code.
 *
 * @param value - The candidate code, in any case.
 * @returns `true` only for the letters-then-two-digits form Congress.gov issues.
 */
export function isCommitteeSystemCode(value: string | undefined): boolean {
  return SYSTEM_CODE_PATTERN.test((value ?? "").trim().toLowerCase());
}

/**
 * A committee named from inside another committee's record — a subcommittee's `parent`, or an entry in a parent's
 * `subcommittees`. Just enough to name and link it; one shape for both directions.
 * @see mapCommitteeRef
 */
export type CommitteeRef = {
  /** Congress.gov's identifier, lower-cased. */
  systemCode: string;
  /** The committee's name. */
  name: string;
};

/**
 * A subcommittee, as its parent's record lists it.
 *
 * A reading name for {@link CommitteeRef} rather than a shape of its own: what a committee reference *is* does not
 * change with the direction it is read from, but "subcommittee" is the word the pages listing them actually use.
 */
export type Subcommittee = CommitteeRef;

/**
 * One row of the committee directory (`/committees`). `systemCode` is required because a row that can't be opened is
 * dropped, as with `MemberDirectoryEntry`.
 */
export type CommitteeSummary = {
  /** Congress.gov's stable identifier, e.g., `"hsag00"`. Lower-cased, since it is also a URL path segment. */
  systemCode: string;
  /** The committee's name as Congress.gov publishes it in the list, e.g., `"Agriculture Committee"`. */
  name: string;
  /** The chamber the committee belongs to. */
  chamber: CommitteeChamber;
  /** The committee's type, grouped five ways. */
  type: CommitteeType;
  /** The verbatim upstream type label, kept so a nuance the five-way grouping flattens isn't lost. */
  typeName?: string;
  /** Set only when this record is itself a subcommittee. @see buildCommitteeDirectory for why those are folded away. */
  parent?: CommitteeRef;
  /** How many subcommittees this committee has, as the list record reports them. */
  subcommitteeCount: number;
};

/**
 * One entry in a committee's history: a name it went by, and when. Renamings track shifts in jurisdiction and party
 * control, which is much of what the committee page teaches.
 */
export type CommitteeHistoryEntry = {
  /** The committee's formal name during this span. */
  name: string;
  /** The Library of Congress's own name for it, when it differs from the formal one. */
  libraryName?: string;
  /** ISO 8601 timestamp, as the API publishes it. */
  startDate?: string;
  /** Absent for the span still in effect. */
  endDate?: string;
  /** e.g., `"Statute"`, `"House Rule X"` — what created the committee, when the record says. */
  establishingAuthority?: string;
};

/**
 * Everything the committee page renders — the full record, fetched one at a time. There's no roster because
 * Congress.gov publishes none, and inferring one would be fabrication.
 */
export type CommitteeProfile = CommitteeSummary & {
  /** Whether the committee exists in the current Congress. A disbanded committee's page is still a useful page. */
  isCurrent: boolean;
  /** Every recorded name and span, most recent first. */
  history: CommitteeHistoryEntry[];
  /** The subcommittees themselves, not just the count. Alphabetical. */
  subcommittees: Subcommittee[];
  /** Bills referred to this committee, as Congress.gov counts them across its whole existence. */
  billCount?: number;
  /** Reports the committee has published. */
  reportCount?: number;
  /** Senate committees only: nominations referred to it. */
  nominationCount?: number;
  /**
   * The committee's own website (e.g., `https://agriculture.house.gov/`), when Congress.gov publishes one.
   *
   * The one per-committee outbound link this page can make, and it is possible only because the API states it
   * outright — @see CONGRESS_GOV_COMMITTEES for the congress.gov link that still cannot be built.
   */
  websiteUrl?: string;
};

/**
 * One thing a committee did with a bill, in Congress.gov's own words ("Referred To", "Reported By", "Markup By", …),
 * printed verbatim rather than paraphrased.
 */
export type BillCommitteeActivity = {
  /** The activity, verbatim (e.g., `"Referred To"`). */
  name: string;
  /** ISO 8601 timestamp, as the API publishes it. */
  date?: string;
};

/** A subcommittee a bill reached, as its parent committee's entry on that bill lists it. */
export type BillSubcommittee = {
  /** Congress.gov's identifier, lower-cased. */
  systemCode: string;
  /** The subcommittee's name. */
  name: string;
  /** What the subcommittee did with the bill. */
  activities: BillCommitteeActivity[];
};

/**
 * One committee a bill was before, and what it did with it — the mirror of {@link CommitteeBillReferral}. Carries both
 * chamber and system code, so the bill page can link inward without another request.
 */
export type BillCommittee = {
  /** Congress.gov's identifier, lower-cased. */
  systemCode: string;
  /** As this endpoint publishes it — usually the `"Committee on Agriculture"` word order rather than the list's. */
  name: string;
  /** The chamber the committee belongs to. */
  chamber: CommitteeChamber;
  /** The committee's type, grouped five ways. */
  type: CommitteeType;
  /** The verbatim upstream type label, kept for the same reason {@link CommitteeSummary} keeps one. */
  typeName?: string;
  /** What the committee did, in the order the record lists it. Empty when it recorded nothing this app can name. */
  activities: BillCommitteeActivity[];
  /** Subcommittees the bill reached beneath this committee, alphabetical. */
  subcommittees: BillSubcommittee[];
};

/**
 * Congress.gov's committee index, where a reader verifies a committee. Not a deep link: committee URLs include a name
 * slug (`/committee/house-agriculture/hsag00`) the API doesn't publish, and a guessed slug risks an
 * authoritative-looking 404. The page prints the system code beside this link instead. The committee's own site is
 * linked directly, since the API publishes it. @see CommitteeProfile.websiteUrl
 */
export const CONGRESS_GOV_COMMITTEES: string = "https://www.congress.gov/committees";

/**
 * Orders any committee shape alphabetically by name, through the app's pinned collator so server and browser agree.
 * @see compareText
 *
 * @param a - One committee to compare.
 * @param b - The other committee to compare.
 * @returns A standard comparator result.
 */
export function compareCommitteesByName(a: { name: string }, b: { name: string }): number {
  return compareText(a.name, b.name);
}

/**
 * The strings a committee should be findable by. The list endpoint says `"Agriculture Committee"` where referral lines
 * and official names say `"Committee on Agriculture"`, so both forms match.
 *
 * Matching only, never display: for some bodies "Committee" is part of the proper name (the Joint Economic Committee),
 * and the rewritten form would be wrong on screen.
 *
 * @param name - The upstream name.
 * @returns The name itself, plus the leading form when one can be derived. Both lower-cased, since the only caller
 *   matches case-insensitively. An empty or whitespace-only name yields an empty list.
 */
export function committeeSearchTerms(name: string): string[] {
  const trimmed: string = name.trim();
  if (trimmed.length === 0) return [];

  const terms: string[] = [trimmed.toLowerCase()];
  const subject: string = trimmed.replace(/\s+Committee$/, "").trim();

  if (subject !== trimmed && subject.length > 0) terms.push(`committee on ${subject.toLowerCase()}`);

  return terms;
}

/**
 * The one-line description of a committee, in plain English.
 *
 * @param committee - The committee to describe; a summary or a profile.
 * @returns A complete sentence, e.g., `"Standing committee of the House of Representatives."`.
 */
export function describeCommittee(committee: Pick<CommitteeSummary, "chamber" | "type">): string {
  // "the House of Representatives" and "the Senate" take the article; "both chambers" does not.
  const seat: string =
    committee.chamber === "joint" ? "both chambers of Congress" : `the ${committeeChamberLabels[committee.chamber]}`;

  return `${committeeTypeNounPhrases[committee.type]} of ${seat}.`;
}

/**
 * A committee's history span, in plain English.
 *
 * @param entry - The history entry to describe.
 * @returns e.g., `"1975–1995"` or `"1975–present"`; an empty string when there's no start date.
 */
export function formatCommitteeHistoryYears(entry: CommitteeHistoryEntry): string {
  const start: string = committeeHistoryYear(entry.startDate);
  if (start.length === 0) return "";

  const end: string = committeeHistoryYear(entry.endDate);
  return `${start}–${end.length > 0 ? end : "present"}`;
}

/**
 * The year out of a committee-history timestamp (`"1975-01-14T00:00:00Z"`). Read off the string, since a `Date` could
 * shift a January or December date across a year boundary by timezone.
 *
 * @param value - The upstream timestamp, if any.
 * @returns The four-digit year, or an empty string when the value carries no recognizable one.
 */
function committeeHistoryYear(value?: string): string {
  const match: RegExpMatchArray | null = (value ?? "").trim().match(/^(\d{4})/);
  return match?.[1] ?? "";
}
