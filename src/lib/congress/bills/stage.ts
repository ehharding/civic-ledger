import { type BillAction, type BillStage, billStages } from "@/lib/congress/bills/model";

/**
 * Phrases that indicate a bill has reached a stage, most advanced first so text mentioning both a committee and
 * enactment reads as enacted. Conservative: anything unrecognized falls through to "introduced".
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
 * For each origin chamber, a whole-word pattern naming the *other* one. A bill only reaches the second chamber by
 * clearing the first, so "Received in the Senate and … referred to the Committee on Finance" means a House bill passed
 * the House, though it reads as a referral. Whole-word so "Housing" and "courthouse" don't match; checked against 1,500
 * bills of the 119th Congress.
 */
const OTHER_CHAMBER: Readonly<Record<"House" | "Senate", RegExp>> = {
  House: /\bsenate\b/,
  Senate: /\bhouse\b/,
};

/**
 * Classifies a bill's latest action text into a `BillJourney` stage — an orientation aid, not a legal determination.
 * Where the full action history is available, {@link inferStageFromActions} is more accurate.
 *
 * @param actionText - The bill's latest action text, verbatim from Congress.gov.
 * @param originChamber - The chamber the bill was introduced in. When known, an action naming the other chamber lifts
 *   the reading to at least `"chamber"` — @see OTHER_CHAMBER. `"Unknown"`, the default, disables that inference.
 * @returns The most advanced stage the text confidently indicates, defaulting to `"introduced"`.
 */
export function inferBillStage(
  actionText: string,
  originChamber: "House" | "Senate" | "Unknown" = "Unknown",
): BillStage {
  const action: string = actionText.toLowerCase();
  const stage: BillStage =
    STAGE_MARKERS.find(({ phrases }): boolean => phrases.some((phrase: string): boolean => action.includes(phrase)))
      ?.stage ?? "introduced";

  if (originChamber === "Unknown" || billStages.indexOf(stage) >= billStages.indexOf("chamber")) return stage;

  return OTHER_CHAMBER[originChamber].test(action) ? "chamber" : stage;
}

/**
 * Library of Congress action codes (`sourceSystem.code` 9) that establish a stage outright. Chamber-system codes are
 * procedural and inconsistent between floors, so they're ignored. Deliberately short: each maps to exactly one stage.
 * There's no floor code, since floor activity isn't passage.
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
 * Reads a bill's stage out of its full action history. The latest action often isn't the most advanced (a referral
 * after passage), so the most advanced recognized code wins regardless of position.
 *
 * @param actions - The bill's actions, in any order.
 * @returns The most advanced stage any action establishes, or `null` when none carries a recognized code — then fall
 *   back to {@link inferBillStage}.
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
 * Settles on the stage to show for a bill: the *more advanced* of the record's stage and the action history's. An
 * overwrite could drop a published `"law"` and show "Public Law 119-21" beside an unfinished stepper; neither reading
 * errs low, so the maximum is safe.
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
