import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { type BillStage, billStageLabels, billStages } from "@/lib/congress/types";

export const metadata: Metadata = { title: "How a Bill Becomes a Law" };

/** One step of the lesson: the BillJourney stage it pins, plus a plain-English explanation of what happens there. */
type LessonStep = {
  stage: BillStage;
  copy: string;
};

/**
 * Content for the lesson. Ordered the same as `billStages`, and deliberately narrow in scope — this walks the same
 * five stages BillJourney already visualizes on a real bill record, rather than re-deriving a separate curriculum.
 */
const steps: LessonStep[] = [
  {
    stage: "introduced",
    copy:
      "A member of Congress formally files the bill's text. It receives a number — like HR 284 or S 917 — that " +
      "identifies it for the rest of this two-year Congress. Other members can sign on as cosponsors, but " +
      "cosponsorship alone does not move a bill forward.",
  },
  {
    stage: "committee",
    copy:
      "The bill is referred to the committee(s) with jurisdiction over its subject. Most bills are never reported " +
      "back out — a committee can hold hearings, rewrite the text, or simply take no further action, which is how " +
      "the large majority of introduced bills quietly end.",
  },
  {
    stage: "chamber",
    copy:
      "If a committee does report the bill, its full chamber — the House or the Senate — can debate, amend, and " +
      "vote on it. Passing one chamber is real progress, but the other chamber still has to pass an identical " +
      "version before the bill can go any further.",
  },
  {
    stage: "president",
    copy:
      "Once both chambers pass the same text, it's presented to the President, who can sign it, let it become law " +
      "without a signature, or veto it and send it back to Congress. A veto isn't a stage this simplified journey " +
      "tracks on its own — it's exactly the kind of nuance the official record captures and this cue does not.",
  },
  {
    stage: "law",
    copy:
      "A signed (or otherwise enacted) bill becomes a public law and is assigned a public-law number. Congress.gov " +
      "links the original bill to that public-law record once it's available.",
  },
];

/**
 * First live editorial learning module, reached from /learn. Walks the same five-stage lifecycle BillJourney already
 * visualizes on a real bill record, one stage at a time, so the stepper on a bill's detail page reads as familiar
 * rather than cryptic.
 */
export default function BillLifecycleLessonPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Civic Basics · Lesson 1"
        title="The Path From an Introduced Bill to a Public Law."
        description="Most Bills Never Reach the Last Step. Seeing Why, Stage by Stage, Makes a Bill's Progress Cue Easier to Read Anywhere Else in This App."
      />

      <div className="lesson-steps">
        {steps.map(
          ({ stage, copy }: LessonStep): JSX.Element => (
            <article className="detail-panel lesson-step" key={stage} aria-labelledby={`lesson-${stage}`}>
              <p className="section-kicker">
                Stage {billStages.indexOf(stage) + 1} of {billStages.length}
              </p>
              <h2 id={`lesson-${stage}`}>{billStageLabels[stage]}</h2>
              <p className="muted-copy">{copy}</p>
              <BillJourney stage={stage} compact />
            </article>
          ),
        )}
      </div>

      <section className="reading-card" aria-labelledby="lesson-next-heading">
        <div className="reading-card__icon">
          <ArrowUpRight aria-hidden="true" size={22} />
        </div>
        <div>
          <p className="section-kicker">Now See It in a Real Bill</p>
          <h2 id="lesson-next-heading">Every Stage Here Maps to the Same Stepper on a Live Bill Record.</h2>
          <p>
            Open Any Bill in the Directory and Watch This Same Five-Step Journey Track Its Actual, Source-Linked
            Progress.
          </p>
        </div>
        <Link href="/bills" className="secondary-link">
          Explore Bills <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
    </SiteShell>
  );
}
