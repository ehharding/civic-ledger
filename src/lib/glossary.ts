/** A single civic-vocabulary entry rendered on the /learn page. */
export type GlossaryTerm = {
  term: string;
  plainEnglish: string;
  detail: string;
};

/** Static glossary content for the /learn page. Hand-curated — not sourced from the Congress.gov API. */
export const glossary: GlossaryTerm[] = [
  {
    term: "Bill",
    plainEnglish: "A proposal for a new law or a change to an existing one.",
    detail:
      "A bill may begin in either chamber, then needs to clear both chambers in the same form before it goes to the President.",
  },
  {
    term: "Committee",
    plainEnglish: "A smaller group of lawmakers that studies bills in a subject area.",
    detail:
      "Most bills are sent to a committee first. A committee can hold hearings, revise the text, vote on it, or take no further action.",
  },
  {
    term: "Cosponsor",
    plainEnglish: "A member of Congress who formally joins a bill after it is introduced.",
    detail: "Cosponsorship can signal support, but it does not itself advance a bill through the legislative process.",
  },
  {
    term: "Public Law",
    plainEnglish: "A bill that completed the federal lawmaking process and received a public-law number.",
    detail: "Congress.gov connects enacted bills to their public-law record when that record becomes available.",
  },
];
