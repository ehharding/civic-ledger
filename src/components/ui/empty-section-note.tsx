import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/bills/model";

/**
 * The one sentence a record section prints when it has nothing to list, and the rule that decides which sentence.
 *
 * Ten sections across the bill, member, and committee pages have to answer the same question — a collection came back
 * empty, so what does the reader get told? — and the answer is never "nothing", because an empty panel reads as a bug
 * in this app rather than as a fact about the record. It is one of two sentences, and which one is not a wording
 * choice:
 *
 * - **On preview data, the section says it is waiting for live records.** A fixture holds three invented cosponsors
 *   and no summaries; saying "the Congressional Research Service hasn't published a summary" over that would credit a
 *   real institution with the absence of invented content. Preview copy never makes a claim about the congressional
 *   record. @see docs/data-policy.md.
 * - **On live data, the section says why an absence is ordinary.** Most bills carry no companion measure, most
 *   questions are settled by voice vote, and a resolution taken up on the floor never acquires a referral. A bare "none
 *   found" turns each of those into an apparent gap.
 *
 * Ten sections through one branch, rather than ten sections each spelling it out: a rule stated in one place is one
 * that cannot be got backwards in the eleventh section, and it is a rule whose failure mode is a false claim about the
 * congressional record rather than a typo.
 */

/**
 * Words the wait for live data.
 *
 * Exported on its own for the one caller that needs the sentence rather than the element: `CommitteeRecordsSection`
 * resolves three-way (unavailable / preview / genuinely empty) in a pure function and prints the result itself.
 *
 * @param lead - The subject and its verb, e.g., `"Cosponsors appear"` or `"The action history appears"`. The verb
 *   belongs to the caller because the subjects disagree about number: a shared sentence that fixed the verb would be
 *   choosing each section's wording for it, which is more than this is for.
 * @returns The full sentence.
 */
export function previewPendingCopy(lead: string): string {
  return `${lead} here once live Congress.gov data is connected.`;
}

/** Props for {@link EmptySectionNote}. */
type EmptySectionNoteProps = {
  /** Whether the surrounding record is live Congress.gov data or a labeled preview fixture. */
  source: CongressSnapshot["source"];
  /** The preview sentence's subject and verb. @see previewPendingCopy */
  previewLead: string;
  /**
   * What to say when the record is live and the collection is genuinely empty. Says why the absence is ordinary rather
   * than only that it exists — @see EmptySectionNote for why that is the standard here rather than a nicety.
   */
  absence: string;
};

/**
 * The line a record section prints in place of a list it has no rows for.
 *
 * @param props - @see EmptySectionNoteProps
 * @returns The note, styled as the same muted copy that introduces a populated section.
 */
export function EmptySectionNote({ source, previewLead, absence }: EmptySectionNoteProps): JSX.Element {
  return <p className="muted-copy">{source === "preview" ? previewPendingCopy(previewLead) : absence}</p>;
}
