import { type BillAction, type BillStage, billStages } from "@/lib/congress/bills/model";

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
 * Reads one line of prose, which is all a *list*-level record carries. Where the full action history has been
 * fetched, {@link inferStageFromActions} is both more accurate and less inferential, and takes precedence.
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

/**
 * Library of Congress action codes that establish a stage outright, rather than suggesting one.
 *
 * These four are the standardized codes the Library of Congress assigns (`sourceSystem.code` 9) at the moments the
 * stepper is about. They are matched instead of the parallel chamber-system codes (`E20000`, `H37300`, …) because the
 * chamber systems report procedural detail rather than milestones, and their coverage differs between the two floors.
 *
 * Deliberately short. Every code here means one specific thing that maps to exactly one stage, and there is no attempt
 * to classify the several hundred other codes the endpoint uses — the prose classifier already handles the low end of
 * the ladder ("Referred to the Committee on…") unambiguously, and a half-decoded taxonomy would be a worse foundation
 * than a small certain one.
 *
 * Notably absent: any code for `"Floor"`. A bill can accumulate dozens of floor actions — debate, motions, quorum
 * calls — without passing anything, so floor activity is not passage and is not treated as it.
 */
const STAGE_ACTION_CODES: Readonly<Record<string, BillStage>> = {
  /** Became Public Law / Signed by President. */
  "36000": "law",
  /** Presented to President. */
  "28000": "president",
  /** Passed/agreed to in House. */
  "8000": "chamber",
  /** Passed/agreed to in Senate. */
  "17000": "chamber",
};

/**
 * Reads a bill's stage out of its full action history, rather than inferring it from one line of prose.
 *
 * This exists because the latest action is frequently *not* the most advanced one. A House bill that passed the House
 * and was then referred to a Senate committee reports "Received in the Senate and Read twice and referred to the
 * Committee on …" as its latest action — which {@link inferBillStage} reads, correctly for the sentence and wrongly for
 * the bill, as `"committee"`. The action history still contains the code for the passage, so the stepper can show that
 * the bill cleared a chamber instead of quietly walking it backwards.
 *
 * The most advanced recognized stage wins regardless of where it sits in the list, for the same reason: the endpoint's
 * order is chronological, not procedural, and a later action is not a more advanced one.
 *
 * @param actions - The bill's actions, in any order.
 * @returns The most advanced stage any action establishes, or `null` when none of them carries a recognized code — in
 *   which case the caller should fall back to {@link inferBillStage}, since "no code matched" is not evidence that a
 *   bill is merely introduced.
 */
export function inferStageFromActions(actions: readonly BillAction[]): BillStage | null {
  let best: BillStage | null = null;
  let bestRank: number = -1;

  for (const action of actions) {
    // `type` is checked alongside the code because the enactment row is the one milestone the endpoint labels twice,
    // and the label is the more stable of the two spellings.
    const stage: BillStage | undefined =
      (action.actionCode ? STAGE_ACTION_CODES[action.actionCode] : undefined) ??
      (action.type === "BecameLaw" ? "law" : undefined);
    if (!stage) continue;

    const rank: number = billStages.indexOf(stage);
    if (rank > bestRank) {
      bestRank = rank;
      best = stage;
    }
  }

  return best;
}

/**
 * Settles on the stage to show for a bill, given everything known about it.
 *
 * Takes the *more advanced* of the two readings rather than letting the action history overwrite the record's own, and
 * that direction is load-bearing. `mapCongressBill` sets `"law"` from the detail endpoint's published `laws`
 * field — the record stating an outcome outright — and an overwrite would discard it in favor of whatever the action
 * codes happened to establish, so a page could print "Public Law 119-21" beside a stepper that stopped at *Passed a
 * Chamber*. One page cannot say both.
 *
 * Taking the maximum costs nothing in the other direction, because neither reading can be the *lower* one by being
 * wrong: {@link inferBillStage} only ever reaches for a stage it can name, and {@link inferStageFromActions} never
 * returns anything below `"chamber"`. The case the action history exists to fix resolves as it should — prose says
 * `"committee"` because the latest action names a referral, the codes say `"chamber"` because the bill passed one, and
 * the more advanced of those is the true one.
 *
 * @param fallback - The stage carried on the bill record itself: published where the record names a law, and inferred
 *   from the latest action's prose otherwise.
 * @param actions - The bill's action history, if it was fetched. Empty in preview mode and whenever the fetch failed.
 * @returns The stage to render.
 */
export function resolveBillStage(fallback: BillStage, actions: readonly BillAction[]): BillStage {
  const fromActions: BillStage | null = inferStageFromActions(actions);
  if (fromActions === null) return fallback;

  return billStages.indexOf(fromActions) > billStages.indexOf(fallback) ? fromActions : fallback;
}
