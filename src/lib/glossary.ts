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
    term: "Referred",
    plainEnglish: "The bill has been assigned to a committee for review.",
    detail:
      "Referral usually happens right after introduction and simply routes the bill to the committee(s) with " +
      "jurisdiction over its subject — it is not, by itself, a sign of support or opposition.",
  },
  {
    term: "Reported",
    plainEnglish: "A committee finished its review and sent the bill back for a vote.",
    detail:
      "A committee reports a bill — sometimes with amendments — when it votes to advance it. Most bills referred to " +
      "committee are never reported, which is how a committee can quietly end a bill's progress.",
  },
  {
    term: "Passed",
    plainEnglish: "One chamber (the House or the Senate) voted to approve the bill.",
    detail:
      "Passing one chamber is not the same as becoming law — the other chamber must also pass an identical version " +
      "before it can go to the President.",
  },
  {
    term: "Public Law",
    plainEnglish: "A bill that completed the federal lawmaking process and received a public-law number.",
    detail: "Congress.gov connects enacted bills to their public-law record when that record becomes available.",
  },
];
