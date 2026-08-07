import { ArrowUpRight, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import type { JSX } from "react";

import { CalloutCard } from "@/components/callout-card";
import { LessonIndex } from "@/components/lesson-index";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { type GlossaryTerm, glossary, glossaryEntryId } from "@/lib/glossary";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Learn",
  description: "Source-linked lessons on how Congress works, and plain-English definitions for its vocabulary.",
  path: "/learn",
});

/**
 * The learning hub.
 *
 * Entirely static: all content comes from the local lesson and glossary modules, with no data fetching, because the
 * vocabulary of the legislative process doesn't change with the news cycle.
 *
 * Lessons sit above the glossary rather than after it, which is a reversal from when there was one lesson and it was a
 * footnote to the vocabulary. The relationship now runs the other way: the modules are the thing to read, and the
 * glossary is the reference you come back to — including for the terms ("markup", "cloture", "quorum") the second and
 * third modules introduce.
 *
 * @returns The lesson index and the glossary.
 */
export default function LearnPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Civic Basics"
        title="Learn the Language As You Go."
        description="Short, source-conscious explanations that turn legislative jargon into plain English."
      />

      <section className="section-heading" aria-labelledby="lessons-heading">
        <div>
          <p className="section-kicker">Lessons</p>
          <h2 id="lessons-heading">Three Walkthroughs, Each Citing Its Sources.</h2>
        </div>
      </section>

      <LessonIndex />

      <section className="section-heading learn-glossary-heading" aria-labelledby="glossary-heading">
        <div>
          <p className="section-kicker">Glossary</p>
          <h2 id="glossary-heading">The Vocabulary, Term by Term.</h2>
        </div>
      </section>

      <div className="glossary-grid">
        {glossary.map(
          (entry: GlossaryTerm): JSX.Element => (
            // h3, not h2: the entries now sit under the "Glossary" section heading rather than directly under the page
            // title, and a heading that skips no level is the whole point of having one.
            //
            // The id is what makes an entry a destination. Every defined term in the app's own prose links here by
            // fragment, so this is the far end of `glossaryHref` — derived from the term by the same function, since a
            // link and its target written down separately are a link that eventually scrolls nowhere.
            <article className="glossary-entry" id={glossaryEntryId(entry.term)} key={entry.term}>
              <p className="section-kicker">{entry.term}</p>
              <h3>{entry.plainEnglish}</h3>
              <p>{entry.detail}</p>
            </article>
          ),
        )}
      </div>

      <CalloutCard
        body="These lessons are written by Civic Ledger, not published by Congress. The Methodology page states what this project claims, and what it refuses to."
        heading="Editorial Content, Held to the Same Rule as the Records."
        headingId="methodology-heading"
        href="/about"
        icon={ScrollText}
        kicker="Why You Can Check It"
        linkIcon={ArrowUpRight}
        linkLabel="Read the Methodology"
      />
    </SiteShell>
  );
}
