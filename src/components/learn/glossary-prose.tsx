import type { JSX } from "react";

import { GlossaryTermTip } from "@/components/learn/glossary-term-tip";
import { annotateGlossaryTerms, type GlossarySegment, glossaryHref } from "@/lib/glossary";

/**
 * Renders a run of prose with every glossary term in it carrying its own definition.
 *
 * A drop-in replacement for printing the string directly: `<p>{step.copy}</p>` becomes
 * `<p><GlossaryProse text={step.copy} /></p>`, and nothing else about the surrounding markup changes. The scan itself
 * is {@link annotateGlossaryTerms}, which is pure and tested on its own; this only decides what a matched run looks
 * like.
 *
 * Deliberately a *server* component wrapping a client one. The definitions are chosen here, on the server, so a page
 * ships only the entries its own text actually uses rather than the whole glossary — and prose containing no defined
 * term crosses no client boundary at all, since no `GlossaryTermTip` is rendered to cross it.
 *
 * @param text - The prose to render. Passed as a string rather than as children, because the annotation works on text
 *   and accepting arbitrary nodes would promise a traversal this deliberately does not do.
 * @returns The same text, with its first mention of each defined term linked to the glossary and carrying a hover and
 *   focus definition.
 */
export function GlossaryProse({ text }: { text: string }): JSX.Element {
  return (
    <>
      {annotateGlossaryTerms(text).map((segment: GlossarySegment, index: number): JSX.Element => {
        // The index is a stable key here in a way it usually is not: these segments are positional runs of one fixed
        // string, so a given index always names the same run for as long as the text is the same — and when the text
        // changes, every segment after the edit has genuinely changed too.
        const key: string = `${index}-${segment.text}`;

        if (!segment.entry) return <span key={key}>{segment.text}</span>;

        return (
          <GlossaryTermTip entry={segment.entry} href={glossaryHref(segment.entry.term)} key={key}>
            {segment.text}
          </GlossaryTermTip>
        );
      })}
    </>
  );
}
