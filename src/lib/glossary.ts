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
 * one-line definition of "cosponsor" is vocabulary anyone can confirm in a sentence, while a five-step account of how
 * a chamber records a vote is a claim, and claims get sources. What this file owes instead is *coverage* — every term
 * a lesson leans on should be findable here, which is why the committee and voting modules brought eight entries with
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
