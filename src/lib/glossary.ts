import type { Route } from "next";

/** A single civic-vocabulary entry rendered on the `/learn` page. */
export type GlossaryTerm = {
  /** The word or phrase, in title case. */
  term: string;
  /** What the term means, in one sentence. */
  plainEnglish: string;
  /** What people commonly get wrong about it. */
  detail: string;
};

/**
 * Hand-curated glossary for `/learn`, ordered roughly as a bill moves through Congress. Uncited, unlike the
 * lessons — one-line vocabulary rather than claims — but every term a lesson leans on must appear here.
 */
export const glossary: GlossaryTerm[] = [
  {
    term: "Bill",
    plainEnglish: "A proposal for a new law or a change to an existing one.",
    detail:
      "A bill may begin in either chamber, then needs to clear both chambers in the same form before it goes to the " +
      "President.",
  },
  {
    term: "Committee",
    plainEnglish: "A smaller group of lawmakers that studies bills in a subject area.",
    detail:
      "Most bills are sent to a committee first. A committee can hold hearings, revise the text, vote on it, or take " +
      "no further action.",
  },
  {
    term: "Cosponsor",
    plainEnglish: "A member of Congress who formally joins a bill after it is introduced.",
    detail: "Cosponsorship can signal support, but it does not itself advance a bill through the legislative process.",
  },
  {
    term: "Subcommittee",
    plainEnglish: "A smaller panel within a committee, covering one slice of its jurisdiction.",
    detail:
      "Much of the detailed work on a bill happens at this level first. A subcommittee only means anything in " +
      "relation to its parent, which is why this app lists them on the parent committee's page.",
  },
  {
    term: "Referred",
    plainEnglish: "The bill has been assigned to a committee for review.",
    detail:
      "Referral usually happens right after introduction and simply routes the bill to the committee(s) with " +
      "jurisdiction over its subject — it is not, by itself, a sign of support or opposition.",
  },
  {
    term: "Hearing",
    plainEnglish: "A committee session where witnesses testify on the record.",
    detail:
      "A hearing builds a record; it is not a vote on the bill. A bill can be the subject of hearings for years " +
      "without ever being voted on.",
  },
  {
    term: "Markup",
    plainEnglish: "The session where a committee goes through a bill and amends it.",
    detail:
      "This is where the text introduced most often stops being the text a chamber votes on — a committee can " +
      "rewrite sections, or replace the bill entirely with a substitute.",
  },
  {
    term: "Amendment",
    plainEnglish: "A proposed change to the text of a measure that is already pending.",
    detail:
      "An amendment being offered is not an amendment being adopted. Most are never voted on at all, and a bill's " +
      "record lists the ones offered to it without saying which of them changed anything.",
  },
  {
    term: "Germane",
    plainEnglish: "Relevant to the subject of the measure being amended.",
    detail:
      "The House generally requires amendments to be germane; the Senate generally does not, which is how an " +
      "unrelated provision can be attached to a bill there. After cloture, the Senate requires it too.",
  },
  {
    term: "Reported",
    plainEnglish: "A committee finished its review and sent the bill back for a vote.",
    detail:
      "A committee reports a bill — sometimes with amendments — when it votes to advance it. Most bills referred to " +
      "committee are never reported, which is how a committee can quietly end a bill's progress.",
  },
  {
    term: "Quorum",
    plainEnglish: "The number of members who must be present for a chamber to do business.",
    detail:
      "The Constitution sets it at a majority of each chamber. In practice both chambers proceed as though a quorum " +
      "is present until a member questions it, which is a procedural move rather than a neutral observation.",
  },
  {
    term: "Voice Vote",
    plainEnglish: "A vote settled by which side sounded louder, with no names recorded.",
    detail:
      "Most questions in both chambers are decided this way. A bill can pass a chamber by voice vote without any " +
      "member having cast a vote anyone can look up afterward.",
  },
  {
    term: "Roll Call Vote",
    plainEnglish: "A recorded vote, where each member's position is entered in the record.",
    detail:
      "Recorded only when demanded — the Constitution lets one-fifth of the members present require it. A bill's " +
      "page here names each one taken on it and links the chamber's own tally; the counts themselves stay there.",
  },
  {
    term: "Passed",
    plainEnglish: "One chamber (the House or the Senate) voted to approve the bill.",
    detail:
      "Passing one chamber is not the same as becoming law — the other chamber must also pass an identical version " +
      "before it can go to the President.",
  },
  {
    term: "Cloture",
    plainEnglish: "The Senate's procedure for ending debate so a vote can happen.",
    detail:
      "It takes three-fifths of all senators — 60 when every seat is filled — which is why a Senate bill with a " +
      "simple majority behind it can stall without ever losing a vote.",
  },
  {
    term: "Veto",
    plainEnglish: "The President's refusal to sign a bill Congress has passed.",
    detail:
      "Congress can enact the bill anyway with a two-thirds vote in both chambers. A bill the President neither " +
      "signs nor returns before Congress adjourns fails without a veto ever being cast.",
  },
  {
    term: "Public Law",
    plainEnglish: "A bill that completed the federal lawmaking process and received a public-law number.",
    detail: "Congress.gov connects enacted bills to their public-law record when that record becomes available.",
  },
];

/**
 * The DOM id `/learn` gives one glossary entry, and the fragment in-app references link to. Derived from the term so
 * the two can't disagree.
 *
 * @param term - The entry's term, as {@link glossary} spells it.
 * @returns The id, e.g., `"glossary-roll-call-vote"`.
 */
export function glossaryEntryId(term: string): string {
  const slug: string = term
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `glossary-${slug}`;
}

/**
 * Builds the in-app link to one glossary entry, e.g., `/learn#glossary-cloture`.
 *
 * @param term - The entry's term.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function glossaryHref(term: string): Route {
  return `/learn#${glossaryEntryId(term)}` as Route;
}

/** One run of text produced by {@link annotateGlossaryTerms}: ordinary prose, or an occurrence of a glossary term. */
export type GlossarySegment = {
  /** The source text this run covers, exactly as written (case and plural kept). */
  text: string;
  /** The entry `text` names, or `undefined` for the prose between matches. */
  entry?: GlossaryTerm;
};

/** The entries, longest term first, since regex alternation is first-match-wins rather than longest-match-wins. */
const termsByLength: readonly GlossaryTerm[] = glossary.toSorted(
  (a: GlossaryTerm, b: GlossaryTerm): number => b.term.length - a.term.length,
);

/**
 * Finds any glossary term in prose: case-insensitive, allowing plural and possessive suffixes only (a broader stemmer
 * would match "vetoed" or "cosponsorship"), and `\s+` between words. Each term is its own capture group, so a match
 * resolves straight back to its entry.
 */
const TERM_PATTERN: RegExp = new RegExp(
  `\\b(?:${termsByLength
    .map(
      (entry: GlossaryTerm): string => `(${entry.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")})`,
    )
    .join("|")})(?:['’]s|e?s)?\\b`,
  "gi",
);

/**
 * Splits prose into plain text and the glossary terms it uses. Only the first occurrence of each term is annotated, so
 * a repeated word doesn't become a paragraph of underlines.
 *
 * @param text - The prose to scan.
 * @returns Alternating plain and annotated runs whose `text` concatenates back to the input exactly. Empty input yields
 *   no segments.
 */
export function annotateGlossaryTerms(text: string): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  const seen: Set<string> = new Set<string>();
  let cursor: number = 0;

  // `matchAll` iterates a clone, so the shared global pattern's `lastIndex` never leaks between calls (`exec` would).
  for (const match of text.matchAll(TERM_PATTERN)) {
    const groups: (string | undefined)[] = match.slice(1);
    const entry: GlossaryTerm | undefined = termsByLength[groups.findIndex(Boolean)];

    /* v8 ignore start -- every alternative in the pattern is a capture group built from `termsByLength`, so a match
       always lights exactly one of them. The narrowing is for `noUncheckedIndexedAccess`. */
    if (!entry) continue;
    /* v8 ignore stop */

    if (seen.has(entry.term)) continue;
    seen.add(entry.term);

    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ text: match[0], entry });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
}
