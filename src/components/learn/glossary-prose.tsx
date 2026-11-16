import type { JSX } from "react";

import { GlossaryTermTip } from "@/components/learn/glossary-term-tip";
import { annotateGlossaryTerms, type GlossarySegment, glossaryHref } from "@/lib/glossary";

/**
 * Renders a run of prose with every glossary term in it carrying its own definition. A drop-in for the bare string:
 * `<p>{step.copy}</p>` becomes `<p><GlossaryProse text={step.copy} /></p>`. The scan is {@link annotateGlossaryTerms};
 * this only decides how a match renders.
 *
 * A server component wrapping a client one, so a page ships only the entries its text uses, and prose with no defined
 * term crosses no client boundary at all.
 *
 * @param text - The prose to render. A string rather than children, since the annotation works on text and doesn't
 *   traverse nodes.
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
