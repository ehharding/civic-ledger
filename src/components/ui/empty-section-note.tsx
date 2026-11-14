import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/bills/model";

/**
 * The sentence every record section prints when it has nothing to list — one of three, decided here for all of them:
 *
 * - **Request failed:** say so and claim nothing else (checked first). @see BillSubResource
 * - **Preview data:** say it's waiting for live records, never making a claim about the real record.
 *   @see docs/data-policy.md
 * - **Live data:** explain why the absence is ordinary (most bills have no companion; most votes are voice votes).
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

/**
 * Words an unanswered request, without wording anything else.
 *
 * The sentence names the missing answer and then explicitly disclaims the fact it is standing in for, because a reader
 * who sees only "temporarily unavailable" above an empty panel reasonably concludes the panel is empty. Saying what the
 * page *cannot* say is the part that keeps that from happening.
 *
 * Exported alongside the component for the caller that needs the sentence rather than the
 * element — `CommitteeRecordsSection` resolves its three states in a pure function and prints the result itself.
 *
 * @param lead - The subject and its verb, e.g., `"Cosponsors are"` or `"The action history is"`. The verb belongs to
 *   the caller for the same reason it does in {@link previewPendingCopy}: the subjects disagree about number.
 * @param subject - What the page cannot vouch for, completing "…cannot say whether ___", e.g., `"this bill has any"`.
 * @returns The full sentence.
 */
export function unavailableCopy(lead: string, subject: string): string {
  return `${lead} temporarily unavailable. Congress.gov did not answer this request, so this page cannot say whether ${subject}.`;
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
  /**
   * The request for this collection failed, so neither of the other two sentences may be printed.
   *
   * Optional, and defaulted to `false` for the sections whose collections cannot arrive unanswered — a member's own
   * profile resolves in one request, so its lists are empty or the whole page is preview data, with no third state to
   * distinguish.
   */
  unavailable?: boolean;
  /** The unavailable sentence's subject and verb. Required with `unavailable`. @see unavailableCopy */
  unavailableLead?: string;
  /** What the page cannot vouch for. Required with `unavailable`. @see unavailableCopy */
  unavailableSubject?: string;
};

/**
 * The line a record section prints in place of a list it has no rows for.
 *
 * @param props - @see EmptySectionNoteProps
 * @returns The note, styled as the same muted copy that introduces a populated section.
 */
export function EmptySectionNote({
  source,
  previewLead,
  absence,
  unavailable = false,
  unavailableLead,
  unavailableSubject,
}: EmptySectionNoteProps): JSX.Element {
  // Ordered failure-first: the preview branch below describes fixture data, and the absence branch makes a claim about
  // Congress, and neither is true of a request that never resolved. A caller that flags `unavailable` without the two
  // strings to word it gets the ordinary copy rather than a half-built sentence — the props are optional so the member
  // page needn't carry them at all, and this is the cost of that.
  if (unavailable && unavailableLead && unavailableSubject) {
    return <p className="muted-copy">{unavailableCopy(unavailableLead, unavailableSubject)}</p>;
  }

  return <p className="muted-copy">{source === "preview" ? previewPendingCopy(previewLead) : absence}</p>;
}
