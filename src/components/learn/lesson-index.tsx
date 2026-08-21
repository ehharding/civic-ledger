import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { type Lesson, lessonNumber, lessons } from "@/lib/lessons";
import { lessonHref } from "@/lib/routes";

/**
 * The learn hub's list of modules, in reading order.
 *
 * Replaces the single hand-written `CalloutCard` that pointed at the one lesson that existed. A callout is the right
 * shape for "here is the next thing"; it is the wrong shape for a set, because three stacked warm panels read as three
 * unrelated interruptions rather than as a sequence someone might work through in order.
 *
 * Each card carries two links to one destination, on `BillCard`'s pattern and for its reason: the heading because it is
 * what a person reads and reaches for, and the trailing call to action because a card whose only target is a wrapped
 * sentence is awkward to hit. The call to action names its lesson in an `aria-label` — three cards ending in a bare
 * "Start the Lesson" would give a screen-reader user a list of three indistinguishable destinations.
 *
 * It is an `<ol>` because the order is a claim: each module assumes the one above it, which is the same reason
 * `docs/roadmap.md` is numbered.
 *
 * @returns The lesson list.
 */
export function LessonIndex(): JSX.Element {
  return (
    <ol className="lesson-index">
      {lessons.map((lesson: Lesson): JSX.Element => {
        const href: Route = lessonHref(lesson.slug);

        return (
          <li className="lesson-index__item" key={lesson.slug}>
            <p className="section-kicker">Lesson {lessonNumber(lesson)}</p>
            <h3>
              <Link href={href}>{lesson.heading}</Link>
            </h3>
            <p className="lesson-index__summary">{lesson.summary}</p>
            {/* Length and citation count, which is what someone deciding whether to open a lesson actually wants. A
                "uses the bill stepper" flag lived here briefly and was cut: every module pins at least one stage, so
                it printed on all three and told nobody anything. */}
            <p className="lesson-index__meta">
              {lesson.steps.length} {lesson.stepNoun.toLowerCase()}s · {lesson.sources.length} cited sources
            </p>
            <Link className="text-link" href={href} aria-label={`Start the lesson: ${lesson.title}`}>
              Start the Lesson <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
