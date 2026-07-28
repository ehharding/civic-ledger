import { Check } from "lucide-react";
import type { JSX } from "react";

import { type BillStage, billStageLabels, billStages } from "@/lib/congress/types";

/**
 * Renders the five-stage legislative journey as a stepper, highlighting the bill's current stage and marking earlier
 * stages complete.
 *
 * This is an educational progress cue derived from `inferBillStage`, not an authoritative legal status — the bill
 * detail page says so directly beside it, and links to the official record for anything definitive.
 *
 * @param stage - The bill's inferred stage. Its index in `billStages` is what decides which steps read as already
 *   complete, which is why that array's order is load-bearing rather than cosmetic.
 * @param compact - Switches to the condensed layout used inside `BillCard`.
 * @returns An ordered list of the five stages, each marked complete, current, or upcoming.
 */
export function BillJourney({ stage, compact }: { stage: BillStage; compact: boolean }): JSX.Element {
  const currentIndex: number = billStages.indexOf(stage);

  return (
    <ol className={`bill-journey ${compact ? "bill-journey--compact" : ""}`} aria-label="Bill journey">
      {billStages.map((item: BillStage, index: number): JSX.Element => {
        const isComplete: boolean = index < currentIndex;
        const isCurrent: boolean = index === currentIndex;

        return (
          <li className={isCurrent ? "is-current" : isComplete ? "is-complete" : ""} key={item}>
            <span className="journey-dot" aria-hidden="true">
              {isComplete ? <Check size={12} strokeWidth={3} /> : index + 1}
            </span>
            <span>{billStageLabels[item]}</span>
          </li>
        );
      })}
    </ol>
  );
}
