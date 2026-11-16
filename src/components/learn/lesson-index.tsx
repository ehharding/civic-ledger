import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { type Lesson, lessonNumber, lessons } from "@/lib/lessons";
import { lessonHref } from "@/lib/routes";

/**
 * The learn hub's list of modules, in reading order — an `<ol>` because each module assumes the one above it. Cards
 * rather than stacked `CalloutCard`s, which would read as unrelated interruptions rather than a sequence.
 *
 * Each card links twice to one destination, on `BillCard`'s pattern: the heading, and a call to action that's easier to
 * hit than a wrapped sentence. The call to action names its lesson in an `aria-label`, so a screen reader doesn't hear
 * three identical "Start the Lesson" links.
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
