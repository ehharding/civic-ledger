/**
 * Covers the lesson route: its build-time slug list, its per-lesson metadata, and the 404 it renders for a slug naming
 * nothing.
 *
 * The route exists because the lessons are already a list, so the assertion that matters most is that all three of its
 * exports read *that* list rather than restating it — a lesson added to the registry should become a page, a metadata
 * card, and a prerendered route with no further edits, and a slug outside the registry should be a 404 rather than an
 * empty lesson.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";

import LessonPage, { generateMetadata, generateStaticParams } from "@/app/learn/[slug]/page";
import { type Lesson, lessons } from "@/lib/lessons";
import { lessonHref } from "@/lib/routes";
import { expectNotFound } from "@/test/next-not-found";

/** The first lesson, non-null-asserted once here rather than at each use under `noUncheckedIndexedAccess`. */
const firstLesson: Lesson = lessons[0] as Lesson;

describe("generateStaticParams", (): void => {
  it("emits one param object per registered lesson, so every slug prerenders", (): void => {
    expect(generateStaticParams()).toEqual(lessons.map((lesson: Lesson): { slug: string } => ({ slug: lesson.slug })));
  });
});

describe("generateMetadata", (): void => {
  it("names the lesson and points at its own canonical path", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({ params: Promise.resolve({ slug: firstLesson.slug }) });

    expect(metadata.title).toBe(firstLesson.title);
    expect(metadata.description).toBe(firstLesson.summary);
    expect(metadata.alternates?.canonical).toBe(lessonHref(firstLesson.slug));
  });

  it("returns noindex not-found tags for a slug naming no lesson", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({ params: Promise.resolve({ slug: "not-a-lesson" }) });

    expect(metadata.title).toBe("Lesson Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

describe("LessonPage", (): void => {
  it("renders each registered lesson inside the site chrome", async (): Promise<void> => {
    for (const lesson of lessons) {
      const { unmount } = render(await LessonPage({ params: Promise.resolve({ slug: lesson.slug }) }));

      // `heading` rather than `title`: the registry keeps the short name (the tab, the hub card's link) separate from
      // the full-sentence display heading, and this route renders the latter.
      expect(screen.getByRole("heading", { level: 1 }), lesson.slug).toHaveTextContent(lesson.heading);
      expect(screen.getByRole("main"), lesson.slug).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the lesson's steps and its sources", async (): Promise<void> => {
    render(await LessonPage({ params: Promise.resolve({ slug: firstLesson.slug }) }));

    for (const step of firstLesson.steps) {
      // By role rather than by text: a step heading like "Introduced" is also a stage name in the `BillJourney` stepper
      // the lesson embeds, so a bare text query matches two nodes.
      expect(screen.getByRole("heading", { name: step.heading }), step.id).toBeInTheDocument();
    }
    for (const source of firstLesson.sources) {
      expect(screen.getByRole("link", { name: new RegExp(source.title, "i") }), source.href).toHaveAttribute(
        "href",
        source.href,
      );
    }
  });

  it("renders the 404 page for a slug naming no lesson, rather than an empty lesson", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => LessonPage({ params: Promise.resolve({ slug: "not-a-lesson" }) }));
  });

  it("treats an empty slug as not found", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => LessonPage({ params: Promise.resolve({ slug: "" }) }));
  });
});
