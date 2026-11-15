import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { JSX } from "react";

import { BillJourney } from "@/components/bills/bill-journey";
import { PageHeader } from "@/components/layout/page-header";
import { GlossaryProse } from "@/components/learn/glossary-prose";
import { LessonSources } from "@/components/learn/lesson-sources";
import { CalloutCard } from "@/components/ui/callout-card";
import { DetailPanel } from "@/components/ui/detail-panel";
import { type Lesson, type LessonStep, lessonNumber } from "@/lib/lessons";

/**
 * The body of one learning module, in the shape every module shares: header, numbered steps, an honest-limits panel,
 * the citation list, and a "read this next" callout.
 *
 * One component for every module, so the markup (and its `aria-labelledby` wiring) is kept correct in one place. The
 * lesson *content* lives in `src/lib/lessons.ts`, which makes adding a module an edit to one data file rather than a
 * new page.
 *
 * The limits panel is not optional and takes the accent treatment deliberately: every lesson is a simplification, and
 * the panel is where each says which one it made. A reader who skims the steps still passes it on the way to the
 * sources.
 *
 * The steps and the limits run through {@link GlossaryProse}, so a glossary term carries its definition where it is
 * used — these lessons are read *because* the vocabulary is unfamiliar. The headings and intro are left alone: a dotted
 * underline in display type reads as damage, and the step a term belongs to repeats it in its own copy anyway.
 *
 * @param lesson - The module to render.
 * @returns The full lesson body, ready to drop inside a `SiteShell`.
 */
export function LessonArticle({ lesson }: { lesson: Lesson }): JSX.Element {
  const stepCount: number = lesson.steps.length;

  return (
    <>
      <PageHeader
        eyebrow={`Civic Basics · Lesson ${lessonNumber(lesson)}`}
        title={lesson.heading}
        description={lesson.intro}
      />

      <div className="lesson-steps">
        {lesson.steps.map(
          (step: LessonStep, index: number): JSX.Element => (
            <DetailPanel
              as="article"
              className="lesson-step"
              heading={step.heading}
              headingId={`lesson-${step.id}`}
              key={step.id}
              kicker={`${lesson.stepNoun} ${index + 1} of ${stepCount}`}
            >
              <p className="muted-copy">
                <GlossaryProse text={step.copy} />
              </p>
              {step.stage ? <BillJourney stage={step.stage} compact /> : null}
            </DetailPanel>
          ),
        )}
      </div>

      <DetailPanel
        accent
        className="lesson-limits"
        heading={lesson.limitsHeading}
        headingId="lesson-limits-heading"
        kicker="Stated Plainly"
      >
        <ul>
          {lesson.limits.map(
            (limit: string): JSX.Element => (
              <li key={limit}>
                <GlossaryProse text={limit} />
              </li>
            ),
          )}
        </ul>
      </DetailPanel>

      <LessonSources sources={lesson.sources} headingId="lesson-sources-heading" />

      <CalloutCard
        body={lesson.next.body}
        heading={lesson.next.heading}
        headingId="lesson-next-heading"
        href={lesson.next.href}
        icon={ArrowUpRight}
        kicker={lesson.next.kicker}
        linkIcon={ArrowRight}
        linkLabel={lesson.next.linkLabel}
      />
    </>
  );
}
