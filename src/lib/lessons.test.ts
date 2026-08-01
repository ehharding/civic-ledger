/**
 * Covers the learning-module registry's invariants.
 *
 * These are content tests, which is unusual — but the rules in `lessons.ts`'s module comment are the reason
 * `docs/roadmap.md` allowed a second and third module at all, and a rule with no enforcement point is a wish. What is
 * pinned here is not the prose (that changes) but the properties every module has to keep: it cites primary sources, it
 * says what it leaves out, its steps are numbered from a single list, and the lifecycle module still walks the same
 * five stages the rest of the app draws.
 */
import { describe, expect, it } from "vitest";

import { billStageLabels, billStages } from "@/lib/congress/types";
import { findLesson, type Lesson, type LessonSource, type LessonStep, lessonNumber, lessons } from "@/lib/lessons";

/** The publishers a citation may come from. @see the "primary sources only" rule in lessons.ts. */
const ALLOWED_SOURCE_HOSTS: readonly string[] = [
  "www.house.gov",
  "clerk.house.gov",
  "www.senate.gov",
  "www.congress.gov",
  "www.archives.gov",
];

describe("lessons", (): void => {
  it("ships the three modules the roadmap named, in reading order", (): void => {
    expect(lessons.map((lesson: Lesson): string => lesson.slug)).toEqual([
      "how-a-bill-becomes-law",
      "what-committees-do",
      "how-congress-votes",
    ]);
  });

  it("numbers every lesson by its position, so no two can claim the same number", (): void => {
    expect(lessons.map(lessonNumber)).toEqual([1, 2, 3]);
  });

  it("gives every lesson steps, limits, and sources", (): void => {
    for (const lesson of lessons) {
      expect(lesson.steps.length, lesson.slug).toBeGreaterThan(0);
      // The limits panel is the lesson naming its own simplification. A lesson without one is a lesson claiming to be
      // complete, which none of these is.
      expect(lesson.limits.length, lesson.slug).toBeGreaterThan(0);
      expect(lesson.sources.length, lesson.slug).toBeGreaterThan(0);
    }
  });

  it("keeps every step id unique within its lesson, since ids become heading anchors", (): void => {
    for (const lesson of lessons) {
      const ids: string[] = lesson.steps.map((step: LessonStep): string => step.id);
      expect(new Set(ids).size, lesson.slug).toBe(ids.length);
    }
  });

  it("cites only primary sources, over https, with a publisher named", (): void => {
    for (const lesson of lessons) {
      for (const source of lesson.sources) {
        const url: URL = new URL(source.href);

        expect(url.protocol, source.href).toBe("https:");
        expect(ALLOWED_SOURCE_HOSTS, source.href).toContain(url.hostname);
        expect(source.publisher.trim().length, source.href).toBeGreaterThan(0);
        expect(source.title.trim().length, source.href).toBeGreaterThan(0);
      }
    }
  });

  it("does not cite the same document twice within one lesson", (): void => {
    for (const lesson of lessons) {
      const hrefs: string[] = lesson.sources.map((source: LessonSource): string => source.href);
      expect(new Set(hrefs).size, lesson.slug).toBe(hrefs.length);
    }
  });

  it("sends every lesson onward to a real in-app destination", (): void => {
    for (const lesson of lessons) {
      expect(lesson.next.href, lesson.slug).toMatch(/^\/(bills|members|committees|learn)/);
      expect(lesson.next.linkLabel.trim().length, lesson.slug).toBeGreaterThan(0);
    }
  });
});

describe("the bill-lifecycle module", (): void => {
  const lifecycle: Lesson = lessons[0] as Lesson;

  it("walks the same five stages, in the same order, that BillJourney draws", (): void => {
    // The coupling that matters most in this file: a reader who learns the sequence here should recognize it on any
    // bill page rather than learning a second, differently-shaped model of the same process.
    expect(lifecycle.steps.map((step: LessonStep): string | undefined => step.stage)).toEqual([...billStages]);
  });

  it("labels each stage exactly as the stepper does", (): void => {
    for (const step of lifecycle.steps) {
      expect(step.heading).toBe(billStageLabels[step.stage as (typeof billStages)[number]]);
    }
  });

  it("counts its steps as stages, since that is what they are", (): void => {
    expect(lifecycle.stepNoun).toBe("Stage");
  });
});

describe("the committee and voting modules", (): void => {
  it("pin the stepper only where a step really is a stage", (): void => {
    // A "you are here" cue, not a second diagram of the process — one step each. @see LessonStep.
    for (const lesson of lessons.slice(1)) {
      const pinned: LessonStep[] = lesson.steps.filter((step: LessonStep): boolean => step.stage !== undefined);
      expect(pinned.length, lesson.slug).toBeGreaterThan(0);
      expect(pinned.length, lesson.slug).toBeLessThan(lesson.steps.length);
    }
  });

  it("says outright that this app holds no vote data", (): void => {
    const voting: Lesson = lessons[2] as Lesson;
    expect(voting.limits.join(" ")).toMatch(/no vote data/i);
  });

  it("says outright that this app publishes no committee roster", (): void => {
    const committees: Lesson = lessons[1] as Lesson;
    expect(committees.limits.join(" ")).toMatch(/roster/i);
  });
});

describe("findLesson", (): void => {
  it("resolves a known slug", (): void => {
    expect(findLesson("how-congress-votes")?.title).toBe("How Congress Votes");
  });

  it("tolerates the casing and padding a hand-edited URL arrives with", (): void => {
    expect(findLesson("  How-Congress-Votes  ")?.slug).toBe("how-congress-votes");
  });

  it("returns undefined for anything the registry doesn't name, rather than a partial match", (): void => {
    expect(findLesson("how-congress")).toBeUndefined();
    expect(findLesson("")).toBeUndefined();
    expect(findLesson("../bills")).toBeUndefined();
  });
});
