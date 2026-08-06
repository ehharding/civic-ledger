import { compareText } from "@/lib/format";

/**
 * The committee domain model: the closed unions the rest of the app switches on, the three committee shapes it renders,
 * and the helpers that decide how a committee reads on screen.
 *
 * The counterpart to `members.ts`, and deliberately built on the same three rules:
 *
 * - **Upstream free text is narrowed at the boundary.** Congress.gov publishes `chamber` and `committeeTypeCode` as
 *   strings; a value nobody anticipated degrades to a documented fallback rather than leaking an unstyled label into
 *   the UI.
 * - **Display wording lives here, not in a component**, so what a reader (or a screen reader) is told about a committee
 *   is unit-tested rather than only reachable through a rendered page.
 * - **Nothing here performs I/O.** Both sides of the app import this module — the browser filters the directory with
 *   it — so it must not drag the server-only adapter, or the API key it reads, into the client bundle.
 */

/**
 * The chambers a committee can belong to.
 *
 * Wider than `CongressChamber` by one, and that difference is the whole reason this is its own union rather than a
 * reuse: a *member* sits in the House or the Senate and nowhere else, while a committee can be joint — the Joint
 * Economic Committee and the Joint Committee on Taxation are neither chamber's, and folding them into either would be a
 * factual error rather than a rounding. These values are also the path segments Congress.gov's committee endpoint
 * accepts, which is why they are lower-case here and go into the route unchanged.
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
 * @returns The matching chamber, or `null` for anything unrecognized — including the API's own `"NoChamber"`, which it
 *   uses for records that are not a committee of either body. Callers drop those rather than filing them under a
 *   chamber they do not belong to.
 */
export function normalizeCommitteeChamber(chamber?: string): CommitteeChamber | null {
  const value: string = (chamber ?? "").trim().toLowerCase();

  if (value === "house" || value === "house of representatives") return "house";
  if (value === "senate") return "senate";
  if (value === "joint") return "joint";

  return null;
}

/**
 * The kinds of committee this app groups by.
 *
 * Congress.gov's `committeeTypeCode` is free text whose documented values are "Commission or Caucus", "Joint", "Other",
 * "Select", "Special", "Standing", "Subcommittee", and "Task Force". Those collapse to five here, because the
 * distinctions this app drops are ones a reader has no use for: "Special" and "Select" name the same thing in the two
 * chambers' own usage, and "Other" and "Task Force" are residual buckets that only ever hold a handful of bodies.
 * Anything unrecognized becomes `"other"` rather than a new, unstyled group.
 *
 * "Subcommittee" is deliberately absent. A subcommittee's *kind* is a fact about its parent, and this app models the
 * parent relationship structurally — @see CommitteeSummary.parent — so a type that only ever restated it would be a
 * second, silently-drifting answer to the same question.
 */
export const committeeTypes = ["standing", "select", "joint", "commission", "other"] as const;

export type CommitteeType = (typeof committeeTypes)[number];

/**
 * How each type reads as a noun phrase, for a sentence rather than a chip.
 *
 * Separate from {@link committeeTypeLabels} because a label and a noun phrase genuinely differ here: "Commission or
 * Caucus" is the right chip and "Commission or Caucus committee" is not a thing anyone would write, while "Other" is a
 * fine chip and no kind of sentence at all.
 */
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

/**
 * One sentence on what each kind of committee *is*.
 *
 * The reason this app has a committees section at all: "Standing" and "Select" are the two words that decide whether a
 * body is a permanent part of how Congress works or a temporary one convened for a single purpose, and a directory that
 * prints the label without ever saying what it means teaches a reader nothing they did not already know.
 */
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
 * Narrows Congress.gov's `committeeTypeCode` to a {@link CommitteeType}.
 *
 * Prefix and substring matching rather than exact equality, for the same reason `normalizePartyName` matches on stems:
 * the upstream values arrive with inconsistent spacing and casing across endpoints ("Commission or Caucus" on one,
 * "commission" on another), and matching loosely absorbs that without an exhaustive list of spellings.
 *
 * @param type - The upstream `committeeTypeCode` or `type`, if any.
 * @returns The matching type, or `"other"` for anything unrecognized — never a thrown error, since a new category
 *   appearing upstream should change a label, not take down the page.
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
 * The shape of a Congress.gov committee system code — the stable identifier this app keys committees on, e.g.
 * `"hsag00"` for the House Committee on Agriculture and `"hsag14"` for one of its subcommittees.
 *
 * Used both as a route guard (these arrive from the URL bar, so they are untrusted by definition) and to decide whether
 * an official-record reference can honestly be offered. The preview fixtures deliberately use codes that *cannot* match
 * this pattern, so a placeholder committee can never be presented as a real one.
 *
 * Deliberately looser than the four-letters-plus-two-digits form every code observed today takes: the pattern's job is
 * to make a value safe to interpolate into an outbound path, and a real code that a too-tight guard rejected would be a
 * 404 on a committee that exists.
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

/** A committee's parent, when it is a subcommittee. Just enough to name it and link to it. */
export type CommitteeParent = {
  systemCode: string;
  name: string;
};

/** A subcommittee, as its parent's record lists it. */
export type Subcommittee = {
  systemCode: string;
  name: string;
};

/**
 * One row of the browsable committee directory (`/committees`).
 *
 * The committee counterpart to `MemberDirectoryEntry`, and it holds the same line: a row nobody can open is dead weight
 * in a directory whose whole purpose is to reach a committee's page, so `systemCode` is required and a record without
 * one is dropped at the boundary rather than rendered as an inert card.
 */
export type CommitteeSummary = {
  /** Congress.gov's stable identifier, e.g. `"hsag00"`. Lower-cased, since it is also a URL path segment. */
  systemCode: string;
  /** The committee's name as Congress.gov publishes it in the list, e.g. `"Agriculture Committee"`. */
  name: string;
  chamber: CommitteeChamber;
  type: CommitteeType;
  /** The verbatim upstream type label, kept so a nuance the five-way grouping flattens isn't lost. */
  typeName?: string;
  /** Set only when this record is itself a subcommittee. @see buildCommitteeDirectory for why those are folded away. */
  parent?: CommitteeParent;
  /** How many subcommittees this committee has, as the list record reports them. */
  subcommitteeCount: number;
};

/**
 * One entry in a committee's history: the name it went by, and the span it went by it.
 *
 * The most genuinely educational thing Congress.gov publishes about a committee, and the reason the detail page exists
 * rather than the directory linking straight out. A committee's jurisdiction is rewritten by renaming it — "Committee
 * on Education and Labor" becoming "Committee on Education and the Workforce" and back again is a record of which party
 * held the chamber, not a clerical tidy-up — and that story is invisible from a name alone.
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
  /** e.g. `"Statute"`, `"House Rule X"` — what created the committee, when the record says. */
  establishingAuthority?: string;
};

/**
 * Everything the individual committee page renders.
 *
 * A superset of {@link CommitteeSummary}, on the same reasoning that makes `MemberProfile` a superset of
 * `MemberDirectoryEntry`: the directory serializes a few hundred summaries into one page payload and so stays
 * deliberately minimal, while this is fetched one at a time and can afford the whole record.
 *
 * Note what is *not* here: a roster. Congress.gov's committee endpoint publishes no membership, so this app does not
 * claim one — inferring who sits on a committee from anything else available would be a fabrication wearing the same
 * typeface as the surrounding facts.
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
 * One thing a committee did with a bill, as the bill's own committee record states it.
 *
 * The vocabulary is Congress.gov's, printed verbatim — "Referred To", "Reported By", "Markup By", "Hearings By" — on
 * the same rule the committee page's referral rows already follow: a relationship the publisher recorded is not
 * paraphrased into a status this app invented.
 */
export type BillCommitteeActivity = {
  name: string;
  /** ISO 8601 timestamp, as the API publishes it. */
  date?: string;
};

/** A subcommittee a bill reached, as its parent committee's entry on that bill lists it. */
export type BillSubcommittee = {
  systemCode: string;
  name: string;
  activities: BillCommitteeActivity[];
};

/**
 * One committee a bill was before, and what that committee did with it.
 *
 * The mirror image of {@link CommitteeBillReferral}, which the committee page reads from the other end — and much the
 * cheaper direction. Answering "which committees held this bill" costs one request and arrives with names attached,
 * where answering "which bills did this committee hold" costs one lookup per row to recover the titles the
 * committee-bills endpoint omits.
 *
 * It is also the one shape in this app that carries a committee's chamber *and* its system code together on a record
 * that isn't a committee record: the committee item endpoint states no chamber at all, so a bill's referral is what
 * makes an inward link buildable without a second round trip.
 */
export type BillCommittee = {
  systemCode: string;
  /** As this endpoint publishes it — usually the `"Committee on Agriculture"` word order rather than the list's. */
  name: string;
  chamber: CommitteeChamber;
  type: CommitteeType;
  /** The verbatim upstream type label, kept for the same reason {@link CommitteeSummary} keeps one. */
  typeName?: string;
  /** What the committee did, in the order the record lists it. Empty when it recorded nothing this app can name. */
  activities: BillCommitteeActivity[];
  /** Subcommittees the bill reached beneath this committee, alphabetical. */
  subcommittees: BillSubcommittee[];
};

/**
 * Congress.gov's own index of committees — where a reader is sent to verify a committee against the official record.
 *
 * Deliberately the index rather than a per-committee deep link, and this is a decision rather than an omission.
 * Congress.gov's committee URLs are of the form `/committee/house-agriculture/hsag00`: a *name slug* followed by the
 * system code. The slug is not published by the API, and building one from the committee's name is guesswork — the list
 * endpoint says "Agriculture Committee" while the slug says "house-agriculture", and the two diverge further the longer
 * the name gets. A guessed slug that happens to be wrong produces a link that looks authoritative and lands on a 404,
 * which is a worse outcome for a project whose whole claim is that you can check it than sending a reader one click
 * further than strictly necessary.
 *
 * So the committee page links here and prints the system code beside it, which is the thing that actually identifies
 * the committee on the destination. This is the same rule the preview fixtures follow for bills — @see
 * `CONGRESS_GOV_HOME` in types.ts — applied for a different reason: not "this record isn't real", but "this URL isn't
 * knowable from what the API gives us".
 *
 * That rule is about congress.gov specifically, and it is unchanged. What *is* now linkable is the committee's own
 * site, because the API publishes that URL rather than leaving it to be guessed. @see CommitteeProfile.websiteUrl.
 */
export const CONGRESS_GOV_COMMITTEES: string = "https://www.congress.gov/committees";

/**
 * Orders committees alphabetically by name.
 *
 * Collated through the app's one pinned collator, for exactly the reason `compareMembersByName` is: the server orders
 * the directory before serializing it and the browser re-orders the same list as the reader narrows, and two runtimes
 * disagreeing about alphabetical order is a hydration mismatch across the whole grid. @see compareText in format.ts.
 *
 * Declared structurally so it orders any named committee shape — a summary, a profile, a subcommittee — rather than
 * only the one it was written for.
 *
 * @param a - One committee to compare.
 * @param b - The other committee to compare.
 * @returns A standard comparator result.
 */
export function compareCommitteesByName(a: { name: string }, b: { name: string }): number {
  return compareText(a.name, b.name);
}

/**
 * The strings a committee should be findable by, given the name Congress.gov publishes for it.
 *
 * **Never displayed.** This exists because the same committee is published under two different word orders depending on
 * where you meet it: the list endpoint says `"Agriculture Committee"`, while a bill's referral line, the chambers' own
 * sites, and the committee's item-level `officialName` all say `"Committee on Agriculture"`. A reader who pastes a
 * referral line into the search box is searching for a string that appears nowhere in the list data, and would be told
 * the committee doesn't exist.
 *
 * An earlier version of this rewrote the name for *display* instead, and that was wrong for a reason worth recording:
 * "Committee" is part of the proper name of some bodies rather than a suffix on a subject. Moving it turns the Joint
 * Economic Committee into "Committee on Joint Economic". There is no reliable way to tell those two cases apart from
 * the string alone, so this app displays whatever Congress.gov published and confines the rewrite to matching, where an
 * extra variant that reads oddly costs nothing because nobody ever sees it.
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
 * Lives in the model rather than being assembled at the call site, on the same rule the rest of this file follows and
 * `members.ts` before it: what a reader is told about a committee is display wording, so it belongs somewhere it can be
 * unit-tested rather than somewhere it can only be reached by rendering a page. The route's `generateMetadata` was the
 * last place in the committee code building a sentence by indexing two label tables by hand, which is exactly the kind
 * of thing this rule exists to keep out of route files.
 *
 * @param committee - The committee to describe. Takes the shared summary fields, so a profile serves as well as a
 *   directory row.
 * @returns e.g. `"Standing committee of the House of Representatives."` — a complete sentence, since its only caller is
 *   a page description and a fragment would read as a truncation.
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
 * @returns e.g. `"1975–1995"`, or `"1975–present"` for the span still in effect. An empty string when the entry carries
 *   no start date, so callers can omit the line rather than print a dash with nothing around it.
 */
export function formatCommitteeHistoryYears(entry: CommitteeHistoryEntry): string {
  const start: string = committeeHistoryYear(entry.startDate);
  if (start.length === 0) return "";

  const end: string = committeeHistoryYear(entry.endDate);
  return `${start}–${end.length > 0 ? end : "present"}`;
}

/**
 * The year out of a committee-history timestamp.
 *
 * These arrive as full ISO 8601 timestamps (`"1975-01-14T00:00:00Z"`), and the day and hour of a committee's renaming
 * are noise beside the year it happened in. Read off the string rather than through a `Date`, which would shift the
 * year across a timezone for a January or December date.
 *
 * @param value - The upstream timestamp, if any.
 * @returns The four-digit year, or an empty string when the value carries no recognizable one.
 */
function committeeHistoryYear(value?: string): string {
  const match: RegExpMatchArray | null = (value ?? "").trim().match(/^(\d{4})/);
  return match?.[1] ?? "";
}
