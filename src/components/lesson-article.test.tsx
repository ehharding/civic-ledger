/**
 * Covers the shared lesson body against the real registry rather than a fixture.
 *
 * That is deliberate: this component's job is to render *any* module correctly, and the thing most likely to break as
 * modules are added is a module whose shape the component didn't anticipate — a lesson with no stepper on any step, a
 * lesson with more steps than the five the first one has. Rendering all three is the cheapest way to keep that honest.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LessonArticle } from "@/components/lesson-article";
import { type Lesson, type LessonStep, lessonNumber, lessons } from "@/lib/lessons";

describe("LessonArticle", (): void => {
  it.each(lessons.map((lesson: Lesson): [string, Lesson] => [lesson.slug, lesson]))(
    "renders %s with its heading, every step, its limits, and its sources",
    (_slug: string, lesson: Lesson): void => {
      render(<LessonArticle lesson={lesson} />);

      expect(screen.getByRole("heading", { level: 1, name: lesson.heading })).toBeInTheDocument();
      expect(screen.getByText(`Civic Basics · Lesson ${lessonNumber(lesson)}`)).toBeInTheDocument();

      for (const step of lesson.steps) {
        expect(screen.getByRole("heading", { level: 2, name: step.heading })).toBeInTheDocument();
      }

      expect(screen.getByRole("region", { name: lesson.limitsHeading })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Sources" })).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: new RegExp(lesson.sources[0]?.title ?? "") }).length).toBeGreaterThan(
        0,
      );
    },
  );

  it("numbers steps with the noun the lesson chose, out of one count", (): void => {
    const lifecycle: Lesson = lessons[0] as Lesson;
    render(<LessonArticle lesson={lifecycle} />);

    expect(screen.getByText(`Stage 1 of ${lifecycle.steps.length}`)).toBeInTheDocument();
    expect(screen.getByText(`Stage ${lifecycle.steps.length} of ${lifecycle.steps.length}`)).toBeInTheDocument();
  });

  it("draws the stepper only on the steps that pin a stage", (): void => {
    const committees: Lesson = lessons[1] as Lesson;
    render(<LessonArticle lesson={committees} />);

    const pinned: number = committees.steps.filter((step: LessonStep): boolean => step.stage !== undefined).length;
    expect(screen.getAllByRole("list", { name: "Bill journey" })).toHaveLength(pinned);
  });

  it("labels each step's panel by its own heading", (): void => {
    const voting: Lesson = lessons[2] as Lesson;
    render(<LessonArticle lesson={voting} />);

    const firstStep: LessonStep = voting.steps[0] as LessonStep;
    const panel: HTMLElement = screen.getByRole("article", { name: firstStep.heading });
    expect(within(panel).getByText(firstStep.copy)).toBeInTheDocument();
  });

  it("closes with the lesson's own onward callout", (): void => {
    const committees: Lesson = lessons[1] as Lesson;
    render(<LessonArticle lesson={committees} />);

    const callout: HTMLElement = screen.getByRole("region", { name: committees.next.heading });
    expect(within(callout).getByRole("link", { name: committees.next.linkLabel })).toHaveAttribute(
      "href",
      committees.next.href,
    );
  });
});
