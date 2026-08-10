import type { JSX } from "react";

import { OutboundLink } from "@/components/ui/outbound-link";
import type { LessonSource } from "@/lib/lessons";

/** Props for {@link LessonSources}. */
type LessonSourcesProps = {
  sources: LessonSource[];
  /**
   * Ties the `<section>` to its own heading via `aria-labelledby`. Passed in rather than fixed, so a page rendering
   * more than one lesson body cannot produce two elements claiming the same id.
   */
  headingId: string;
};

/**
 * The citation list that closes a lesson.
 *
 * This component is the visible half of the rule `docs/roadmap.md` gated the second and third learning modules on: a
 * lesson is editorial content, editorial content makes claims, and this app's whole premise is that a reader can go
 * check. The glossary needs nothing like this — a one-line definition of "cosponsor" is not a claim anyone would want
 * to trace — but a five-step explanation of how a chamber records a vote is.
 *
 * Each entry names its publisher beside its title, because that is the part carrying the weight: "About Voting" could
 * be anyone's blog post, and "About Voting — U.S. Senate" is the Senate explaining its own floor procedure. Every link
 * goes through {@link OutboundLink}, so a citation inherits the same new-tab, no-referrer, announced-to-a-screen-reader
 * contract every other primary-source link in this app has, rather than re-deriving it.
 *
 * @param props - @see LessonSourcesProps
 * @returns The sources section: its heading, a note on what these are, and one linked citation per source.
 */
export function LessonSources({ sources, headingId }: LessonSourcesProps): JSX.Element {
  return (
    <section className="lesson-sources" aria-labelledby={headingId}>
      <p className="section-kicker">Check It Yourself</p>
      <h2 id={headingId}>Sources</h2>
      <p className="muted-copy">
        This lesson is written by Civic Ledger, not published by Congress. Everything it describes comes from these
        primary sources.
      </p>
      <ul className="lesson-source-list">
        {sources.map(
          (source: LessonSource): JSX.Element => (
            <li key={source.href}>
              <OutboundLink href={source.href}>{source.title}</OutboundLink>
              <span className="lesson-source-list__publisher">{source.publisher}</span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
