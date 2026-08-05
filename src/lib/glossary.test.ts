/**
 * Covers the glossary's editorial invariants.
 *
 * Content tests, for the same reason `lessons.test.ts` has them: `glossary.ts`'s module comment states what this file
 * owes the rest of the app — a term for every piece of vocabulary a lesson leans on, and a `detail` that corrects
 * rather than restates — and a rule with no enforcement point is a wish. What's pinned here is the shape of an entry
 * and the coverage obligation, not the prose.
 */
import { describe, expect, it } from "vitest";

import {
  annotateGlossaryTerms,
  type GlossarySegment,
  type GlossaryTerm,
  glossary,
  glossaryEntryId,
  glossaryHref,
} from "@/lib/glossary";
import type { Lesson } from "@/lib/lessons";
import { lessons } from "@/lib/lessons";

/** The terms an annotation run found, in order, as the entries they resolved to. */
function matchedTerms(segments: GlossarySegment[]): string[] {
  return segments.flatMap((segment: GlossarySegment): string[] => (segment.entry ? [segment.entry.term] : []));
}

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

describe("glossaryEntryId", (): void => {
  it("lower-cases a term and joins its words with hyphens", (): void => {
    expect(glossaryEntryId("Roll Call Vote")).toBe("glossary-roll-call-vote");
  });

  it("collapses punctuation and surrounding space rather than carrying it into an id", (): void => {
    expect(glossaryEntryId("  Public   Law! ")).toBe("glossary-public-law");
  });

  it("gives every entry in the glossary a distinct id, since each one is a link target", (): void => {
    // The whole in-prose glossary points at these fragments. Two entries resolving to one id would send half the app's
    // defined terms to the wrong definition, and it would look like a working link while doing it.
    const ids: string[] = glossary.map((entry: GlossaryTerm): string => glossaryEntryId(entry.term));

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("glossaryHref", (): void => {
  it("points at the term's own entry on the learn page", (): void => {
    expect(glossaryHref("Cloture")).toBe("/learn#glossary-cloture");
  });
});

describe("annotateGlossaryTerms", (): void => {
  it("returns nothing at all for empty text", (): void => {
    expect(annotateGlossaryTerms("")).toEqual([]);
  });

  it("returns text containing no defined term as a single unannotated run", (): void => {
    const segments: GlossarySegment[] = annotateGlossaryTerms("Nothing here is defined anywhere.");

    expect(segments).toEqual([{ text: "Nothing here is defined anywhere." }]);
  });

  it("reproduces its input exactly when the segments are concatenated back together", (): void => {
    // The invariant the whole thing rests on: this runs over editorial prose and congressional action text, and a
    // matcher that could silently drop or reword a clause would be rewriting the record to decorate it.
    for (const source of [
      "Most bills are referred to a committee and never reported.",
      "Referred to the House Committee on the Judiciary.",
      "committee committee committee",
      "A markup.",
    ]) {
      const rebuilt: string = annotateGlossaryTerms(source)
        .map((segment: GlossarySegment): string => segment.text)
        .join("");

      expect(rebuilt, source).toBe(source);
    }
  });

  it("keeps the source's own casing and inflection rather than the entry's spelling", (): void => {
    const segments: GlossarySegment[] = annotateGlossaryTerms("Most committees hold hearings.");

    expect(segments.filter((segment: GlossarySegment): boolean => segment.entry !== undefined)).toEqual([
      { text: "committees", entry: glossary.find((entry: GlossaryTerm): boolean => entry.term === "Committee") },
      { text: "hearings", entry: glossary.find((entry: GlossaryTerm): boolean => entry.term === "Hearing") },
    ]);
  });

  it("matches a possessive", (): void => {
    expect(matchedTerms(annotateGlossaryTerms("the committee's report"))).toEqual(["Committee"]);
    expect(matchedTerms(annotateGlossaryTerms("the committee’s report"))).toEqual(["Committee"]);
  });

  it("annotates only the first mention of each term, so a paragraph does not become a wall of underlines", (): void => {
    const segments: GlossarySegment[] = annotateGlossaryTerms(
      "A committee can hold a hearing, and that committee can then report the bill out of committee.",
    );

    expect(matchedTerms(segments)).toEqual(["Committee", "Hearing", "Bill"]);
  });

  it("matches a multi-word term across whatever spacing the source used", (): void => {
    expect(matchedTerms(annotateGlossaryTerms("A roll  call\nvote was demanded."))).toEqual(["Roll Call Vote"]);
  });

  it("does not match a term buried inside a longer word", (): void => {
    // The suffix group is plural-and-possessive only for exactly this reason: "cosponsorship" is a different claim
    // from "cosponsor", and attaching the second's definition to the first would be a wrong answer, not a partial one.
    expect(annotateGlossaryTerms("Cosponsorship and billing and subcommittees")).toEqual([
      { text: "Cosponsorship and billing and " },
      { text: "subcommittees", entry: glossary.find((entry: GlossaryTerm): boolean => entry.term === "Subcommittee") },
    ]);
  });

  it("prefers the longest term when one could be read as part of another", (): void => {
    // The pattern is ordered longest-first because alternation in a regular expression is first-match-wins. This is
    // what keeps that a property of the matcher rather than an accident of the current word list.
    expect(matchedTerms(annotateGlossaryTerms("Settled by voice vote, not by roll call vote."))).toEqual([
      "Voice Vote",
      "Roll Call Vote",
    ]);
  });

  it("starts each call at the beginning of its own text", (): void => {
    // A `g`-flagged pattern carries a mutable `lastIndex`, so a shared one would resume the next paragraph wherever
    // the previous one stopped — annotating the first call and silently skipping the start of every one after it.
    const first: GlossarySegment[] = annotateGlossaryTerms("A committee reviews the bill.");
    const second: GlossarySegment[] = annotateGlossaryTerms("A committee reviews the bill.");

    expect(matchedTerms(second)).toEqual(matchedTerms(first));
    expect(matchedTerms(second)).toEqual(["Committee", "Bill"]);
  });
});
