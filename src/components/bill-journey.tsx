import { Check } from "lucide-react";
import type { JSX } from "react";

import { type BillStage, billStageLabels, billStages } from "@/lib/congress/types";

/**
 * Renders the five-stage legislative journey (`billStages`) as a stepper, highlighting the bill's current
 * stage and marking earlier stages complete. `compact` switches to the condensed layout used inside BillCard.
 *
 * This is an educational progress cue derived from `inferBillStage`, not an authoritative legal status —
 * see the caveat surfaced alongside it on the bill detail page.
 */
export function BillJourney({ stage, compact }: { stage: BillStage; compact: boolean }): JSX.Element {
  const currentIndex: number = billStages.indexOf(stage);

  return (
    <ol className={`bill-journey ${compact ? "bill-journey--compact" : ""}`} aria-label="Bill journey">
      {billStages.map(
        (item: "chamber" | "committee" | "introduced" | "law" | "president", index: number): JSX.Element => {
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
        },
      )}
    </ol>
  );
}
