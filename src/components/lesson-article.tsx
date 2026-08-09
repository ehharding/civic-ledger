import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { CalloutCard } from "@/components/callout-card";
import { GlossaryProse } from "@/components/glossary-prose";
import { LessonSources } from "@/components/lesson-sources";
import { PageHeader } from "@/components/page-header";
import { type Lesson, type LessonStep, lessonNumber } from "@/lib/lessons";

/**
 * The body of one learning module, in the shape every module shares: header, numbered steps, an honest-limits panel,
 * the citation list, and a "read this next" callout.
 *
 * One component for every module, on the same reasoning that produced `CalloutCard`: a lesson spelling out its own
 * forty lines of markup would be one more place to keep an `aria-labelledby` correct and one more to update when the
 * shape changes. The lesson *content* lives in `src/lib/lessons.ts` and this renders it, which is what makes adding a
 * module an edit to one data file rather than a new page.
 *
 * The limits panel is not optional and takes the accent treatment deliberately. Every one of these lessons is a
 * simplification — that is the point of a lesson — and the panel is where each one says which simplification it made. A
 * reader who skims the steps and stops still passes it on the way to the sources.
 *
 * Both the steps and the limits run through {@link GlossaryProse}, so a word the glossary defines carries its own
 * definition where it is used. That matters most here of anywhere in the app: these lessons are read *because* the
 * vocabulary is unfamiliar, and a definition a reader has to leave the page to find is one most of them won't.
 * Deliberately not applied to the headings or the intro — a dotted underline in display type reads as damage, and the
 * step that a term belongs to says it again in its own copy a sentence later anyway.
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
            <article className="detail-panel lesson-step" key={step.id} aria-labelledby={`lesson-${step.id}`}>
              <p className="section-kicker">
                {lesson.stepNoun} {index + 1} of {stepCount}
              </p>
              <h2 id={`lesson-${step.id}`}>{step.heading}</h2>
              <p className="muted-copy">
                <GlossaryProse text={step.copy} />
              </p>
              {step.stage ? <BillJourney stage={step.stage} compact /> : null}
            </article>
          ),
        )}
      </div>

      <section className="detail-panel detail-panel--accent lesson-limits" aria-labelledby="lesson-limits-heading">
        <p className="section-kicker">Stated Plainly</p>
        <h2 id="lesson-limits-heading">{lesson.limitsHeading}</h2>
        <ul>
          {lesson.limits.map(
            (limit: string): JSX.Element => (
              <li key={limit}>
                <GlossaryProse text={limit} />
              </li>
            ),
          )}
        </ul>
      </section>

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
