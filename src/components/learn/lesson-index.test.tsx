/**
 * Covers the learn hub's module list: that every registered lesson appears, that both links on a card lead to the same
 * page, and — the part worth a test rather than a glance — that the three "Start the Lesson" controls are told apart by
 * their accessible names.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LessonIndex } from "@/components/learn/lesson-index";
import { type Lesson, lessons } from "@/lib/lessons";
import { lessonHref } from "@/lib/routes";

describe("LessonIndex", (): void => {
  it("lists every registered lesson, in order", (): void => {
    render(<LessonIndex />);

    const items: HTMLElement[] = screen.getAllByRole("listitem");
    expect(items).toHaveLength(lessons.length);

    lessons.forEach((lesson: Lesson, index: number): void => {
      expect(within(items[index] as HTMLElement).getByText(`Lesson ${index + 1}`)).toBeInTheDocument();
      expect(within(items[index] as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(lesson.heading);
    });
  });

  it("points both of a card's links at that lesson's route", (): void => {
    render(<LessonIndex />);

    for (const lesson of lessons) {
      const card: HTMLElement = screen
        .getByRole("heading", { level: 3, name: lesson.heading })
        .closest("li") as HTMLElement;

      for (const link of within(card).getAllByRole("link")) {
        expect(link).toHaveAttribute("href", lessonHref(lesson.slug));
      }
    }
  });

  it("distinguishes the three call-to-action links by name", (): void => {
    render(<LessonIndex />);

    for (const lesson of lessons) {
      expect(screen.getByRole("link", { name: `Start the lesson: ${lesson.title}` })).toBeInTheDocument();
    }
  });

  it("summarizes each lesson's shape, so a reader can tell how long it is before opening it", (): void => {
    render(<LessonIndex />);

    const lifecycle: Lesson = lessons[0] as Lesson;
    const card: HTMLElement = screen
      .getByRole("heading", { level: 3, name: lifecycle.heading })
      .closest("li") as HTMLElement;

    expect(
      within(card).getByText(`${lifecycle.steps.length} stages · ${lifecycle.sources.length} cited sources`),
    ).toBeInTheDocument();
  });
});
