/**
 * Covers the glossary's editorial invariants.
 *
 * Content tests, for the same reason `lessons.test.ts` has them: `glossary.ts`'s module comment states what this file
 * owes the rest of the app — a term for every piece of vocabulary a lesson leans on, and a `detail` that corrects
 * rather than restates — and a rule with no enforcement point is a wish. What's pinned here is the shape of an entry
 * and the coverage obligation, not the prose.
 */
import { describe, expect, it } from "vitest";

import { type GlossaryTerm, glossary } from "@/lib/glossary";
import type { Lesson } from "@/lib/lessons";
import { lessons } from "@/lib/lessons";

describe("glossary", (): void => {
  it("gives every entry a term, a plain-English line, and a detail line", (): void => {
    expect(glossary.length).toBeGreaterThan(0);

    for (const entry of glossary) {
      expect(entry.term.trim(), entry.term).not.toBe("");
      expect(entry.plainEnglish.trim(), entry.term).not.toBe("");
      expect(entry.detail.trim(), entry.term).not.toBe("");
    }
  });

  it("names each term exactly once, since the term is the entry's render key", (): void => {
    const terms: string[] = glossary.map((entry: GlossaryTerm): string => entry.term);

    expect(new Set(terms).size).toBe(terms.length);
  });

  it("keeps the detail line from merely restating the plain-English one", (): void => {
    // The two-field split is the file's stated reason for existing: `plainEnglish` is what the word means, `detail` is
    // what people usually get wrong about it. An entry whose second line repeats the first has collapsed back into a
    // one-field glossary.
    for (const entry of glossary) {
      expect(entry.detail, entry.term).not.toBe(entry.plainEnglish);
    }
  });

  it("covers the vocabulary the lessons introduce, which is the coverage obligation the module comment states", (): void => {
    const defined: Set<string> = new Set(glossary.map((entry: GlossaryTerm): string => entry.term.toLowerCase()));

    // Named explicitly rather than scraped from the lesson prose: the point is that *these* words, the ones the module
    // comment cites as the reason the committee and voting lessons brought entries with them, stay findable.
    for (const term of ["committee", "subcommittee", "markup", "quorum", "cloture", "voice vote", "roll call vote"]) {
      expect(defined, term).toContain(term);
    }
  });

  it("stays uncited, unlike the lessons — the line between the two is length, not rigor", (): void => {
    const lessonSlugs: string[] = lessons.map((lesson: Lesson): string => lesson.slug);
    expect(lessonSlugs.length).toBeGreaterThan(0);

    // A glossary entry that had to cite something would be a claim, and claims belong in a lesson. Pinned by checking
    // no entry smuggles a link into its prose.
    for (const entry of glossary) {
      expect(`${entry.plainEnglish} ${entry.detail}`, entry.term).not.toMatch(/https?:\/\//);
    }
  });
});
