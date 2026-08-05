import type { Route } from "next";

/**
 * A single civic-vocabulary entry rendered on the `/learn` page.
 *
 * The two-field split is the point of the whole glossary: `plainEnglish` is what the word means, `detail` is what
 * people usually get wrong about it. "Passed" has a one-line definition anyone would accept and a second line that
 * corrects the assumption most readers arrive with.
 */
export type GlossaryTerm = {
  term: string;
  plainEnglish: string;
  detail: string;
};

/**
 * Static glossary content for the `/learn` page.
 *
 * Hand-curated editorial content, not sourced from the Congress.gov API — which is why it lives in `src/lib` rather
 * than `src/lib/congress`. Ordered roughly by the sequence a bill moves through, so reading top to bottom traces the
 * legislative process rather than the alphabet.
 *
 * Deliberately uncited, unlike the lessons in {@link lessons}. The line between the two is length, not rigor: a
 * one-line definition of "cosponsor" is vocabulary anyone can confirm in a sentence, while a five-step account of how a
 * chamber records a vote is a claim, and claims get sources. What this file owes instead is *coverage* — every term a
 * lesson leans on should be findable here, which is why the committee and voting modules brought eight entries with
 * them.
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
      "Recorded only when demanded — the Constitution lets one-fifth of the members present require it. Civic Ledger " +
      "holds no vote data; the House Clerk and the Senate publish their own tallies.",
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
 * The DOM id `/learn` gives one glossary entry, and the fragment every in-app reference to that term links to.
 *
 * A glossary the rest of the app can *point at* needs each entry to be a place, and a place needs an address. Derived
 * from the term rather than stored beside it on the same rule `lessonNumber` derives a lesson's position: a second
 * hand-maintained field is a field that can disagree with the one it was derived from, and here the disagreement would
 * be a link that scrolls nowhere.
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
 * The fifth member of the `*-route.ts` family in spirit, and it lives here rather than in a file of its own because the
 * fragment half of it is {@link glossaryEntryId}, which the `/learn` page also renders — one function knowing both ends
 * of that pair is what keeps a link and its destination from being written down twice.
 *
 * @param term - The entry's term.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function glossaryHref(term: string): Route {
  return `/learn#${glossaryEntryId(term)}` as Route;
}

/**
 * One run of text produced by {@link annotateGlossaryTerms}: either ordinary prose, or the occurrence of a term the
 * glossary defines.
 *
 * `text` is the source text *exactly* as it appeared, never the entry's own spelling. A sentence that says "most bills
 * are referred to committees" keeps its lower case and its plural; only the definition attached to it comes from the
 * glossary.
 */
export type GlossarySegment = {
  /** The source text this run covers. */
  text: string;
  /** The entry `text` names, or `undefined` for the prose between matches. */
  entry?: GlossaryTerm;
};

/**
 * The glossary's entries ordered longest term first.
 *
 * Alternation in a JavaScript regular expression is first-match-wins rather than longest-match-wins, so a shorter term
 * listed ahead of a longer one that starts with it would claim the shared prefix and leave the rest stranded. No pair
 * in the glossary collides today; ordering by length is what keeps that a property of the matcher rather than a
 * property of the current word list.
 */
const termsByLength: readonly GlossaryTerm[] = [...glossary].sort(
  (a: GlossaryTerm, b: GlossaryTerm): number => b.term.length - a.term.length,
);

/**
 * The pattern that finds any glossary term in a run of prose, built once at module load rather than per call.
 *
 * Three things it has to tolerate, all of which come from matching editorial and congressional prose rather than a
 * controlled vocabulary:
 *
 * - **Case.** Terms are written in title case here and appear lower-cased mid-sentence, so the match is insensitive and
 *   the *source* casing is what gets rendered.
 * - **Inflection.** "Committee" has to find "committees" and "the committee's", or the annotation would skip precisely
 *   the sentences that talk about more than one. The suffix group is deliberately short — plural and possessive only —
 *   since a broader stemmer would start matching words that merely share a root ("cosponsorship", "vetoed") and attach
 *   a definition that does not describe them.
 * - **Spacing.** A multi-word term can be split across a line break in a source string, so the gaps are `\s+` rather
 *   than literal spaces.
 *
 * Each term gets its own capture group, which is how a match is resolved back to the entry that produced it without
 * re-deriving the term from the matched text — the one step that inflection would otherwise make ambiguous.
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
 * Splits a run of prose into plain text and the glossary terms it uses.
 *
 * This is the whole basis of the in-app glossary: rather than a reader having to *know* that "markup" is defined
 * somewhere and go looking, the word carries its own definition wherever it is used. Keeping the scan here — pure,
 * isomorphic, and free of React — is what makes "which words in this paragraph are defined" a unit-testable question
 * instead of something only observable by rendering a page.
 *
 * **Only the first occurrence of each term is annotated.** A lesson step that says "committee" six times would
 * otherwise become six dotted underlines in one paragraph, which reads as emphasis rather than as help and makes the
 * prose harder to get through than the jargon did. The first mention is where a reader who doesn't know the word
 * actually stops.
 *
 * @param text - The prose to scan.
 * @returns The text in order, as alternating plain and annotated runs. Concatenating every segment's `text` reproduces
 *   the input exactly, so nothing can be silently dropped or reworded on the way through. Prose containing no glossary
 *   term comes back as a single unannotated segment, and empty input as no segments at all.
 */
export function annotateGlossaryTerms(text: string): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  const seen: Set<string> = new Set<string>();
  let cursor: number = 0;

  // The shared pattern is safe to reuse specifically because this iterates with `matchAll`, which matches against an
  // internal clone and leaves the original's `lastIndex` untouched. `exec` in a loop would not be: it advances
  // `lastIndex` on the pattern itself, so the second paragraph handed to this function would resume wherever the first
  // one stopped and silently skip its opening sentence. The test beside this pins the property, not the mechanism.
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
