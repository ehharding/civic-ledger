import type { BillStage } from "@/lib/congress/types";

/**
 * Phrases that indicate a bill has reached a given stage, checked in order — most advanced first, so a bill whose
 * action text mentions both a committee and enactment is read as enacted rather than as still in committee.
 *
 * Kept as data rather than a chain of `if` statements so the whole classifier is legible at a glance: adding a phrase
 * is a one-line change that can't accidentally reorder the precedence the rest of it depends on.
 *
 * Deliberately conservative. Congress.gov's action text is prose written for humans, and this only ever drives a
 * learning cue — anything it doesn't confidently recognize falls through to "introduced" rather than guessing at
 * something more advanced.
 */
const STAGE_MARKERS: readonly { stage: BillStage; phrases: readonly string[] }[] = [
  { stage: "law", phrases: ["became public law", "became private law", "signed by president"] },
  { stage: "president", phrases: ["presented to president", "sent to president"] },
  {
    stage: "chamber",
    phrases: ["passed senate", "passed house", "agreed to in senate", "agreed to in house"],
  },
  { stage: "committee", phrases: ["committee", "referred to", "reported by", "subcommittee"] },
];

/**
 * Classifies a bill's latest action text into one of the five stages of the educational `BillJourney` stepper.
 *
 * This is an orientation aid, never an authoritative legal determination — the bill detail page says so beside the
 * stepper, and links to the official record for anything definitive. @see STAGE_MARKERS for the precedence order.
 *
 * @param actionText - The bill's latest action text, verbatim from Congress.gov.
 * @returns The most advanced stage the text confidently indicates, defaulting to `"introduced"`.
 */
export function inferBillStage(actionText: string): BillStage {
  const action: string = actionText.toLowerCase();

  for (const { stage, phrases } of STAGE_MARKERS) {
    if (phrases.some((phrase: string): boolean => action.includes(phrase))) return stage;
  }

  return "introduced";
}
