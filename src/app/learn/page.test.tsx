/**
 * Covers the learning hub.
 *
 * The two structural claims in the route's comment are what's pinned: lessons sit *above* the glossary (a reversal from
 * when there was one lesson and it was a footnote to the vocabulary), and the glossary entries are `h3`s under a
 * section `h2` rather than `h2`s directly under the page title — a heading level that skips is the whole reason the
 * section headings exist.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LearnPage, { metadata } from "@/app/learn/page";
import { type GlossaryTerm, glossary } from "@/lib/glossary";
import { type Lesson, lessons } from "@/lib/lessons";

describe("LearnPage", (): void => {
  it("renders under a single page heading, inside the site chrome", (): void => {
    render(<LearnPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Learn the Language As You Go.");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("lists every lesson in the registry", (): void => {
    render(<LearnPage />);

    for (const lesson of lessons) {
      expect(screen.getByRole("link", { name: new RegExp(lesson.title, "i") }), lesson.slug).toBeInTheDocument();
    }
  });

  it("renders every glossary entry with its term, definition, and detail", (): void => {
    const { container } = render(<LearnPage />);

    const entries: NodeListOf<Element> = container.querySelectorAll(".glossary-entry");
    expect(entries).toHaveLength(glossary.length);

    for (const entry of glossary) {
      expect(screen.getByText(entry.term), entry.term).toBeInTheDocument();
      expect(screen.getByText(entry.detail), entry.term).toBeInTheDocument();
    }
  });

  it("puts each glossary definition at h3, under the section's h2 rather than under the page title", (): void => {
    const { container } = render(<LearnPage />);

    const first: Element | null = container.querySelector(".glossary-entry");
    const firstTerm: GlossaryTerm | undefined = glossary[0];

    expect(firstTerm).toBeDefined();
    expect(within(first as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(
      firstTerm?.plainEnglish as string,
    );
  });

  it("puts the lessons section ahead of the glossary section", (): void => {
    render(<LearnPage />);

    const headings: HTMLElement[] = screen.getAllByRole("heading", { level: 2 });
    const lessonsIndex: number = headings.findIndex(
      (heading: HTMLElement): boolean => heading.id === "lessons-heading",
    );
    const glossaryIndex: number = headings.findIndex(
      (heading: HTMLElement): boolean => heading.id === "glossary-heading",
    );

    expect(lessonsIndex).toBeGreaterThanOrEqual(0);
    expect(glossaryIndex).toBeGreaterThan(lessonsIndex);
  });

  it("labels each section by its own heading, so the landmarks are navigable", (): void => {
    render(<LearnPage />);

    expect(screen.getByRole("region", { name: /Walkthroughs/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "The Vocabulary, Term by Term." })).toBeInTheDocument();
  });

  it("closes with the callout naming this content as editorial rather than published by Congress", (): void => {
    render(<LearnPage />);

    expect(screen.getByText(/written by Civic Ledger, not published by Congress/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the Methodology/ })).toHaveAttribute("href", "/about");
  });

  it("names itself and its canonical path", (): void => {
    expect(metadata.title).toBe("Learn");
    expect(metadata.alternates?.canonical).toBe("/learn");
  });

  it("keeps its heading honest about how many lessons there are", (): void => {
    // The heading says "Three Walkthroughs". If a fourth module is added to the registry, this fails — which is the
    // point: the copy is a claim about the registry's contents, so it belongs under the same enforcement the registry
    // itself has in `lessons.test.ts`.
    render(<LearnPage />);

    const lessonTitles: string[] = lessons.map((lesson: Lesson): string => lesson.title);
    expect(lessonTitles).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 2, name: /Three Walkthroughs/ })).toBeInTheDocument();
  });
});
