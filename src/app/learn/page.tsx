import { ArrowUpRight, BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import type { JSX } from "react";

import { CalloutCard } from "@/components/callout-card";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { type GlossaryTerm, glossary } from "@/lib/glossary";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Learn",
  description: "Plain-English definitions for the vocabulary of the legislative process.",
  path: "/learn",
});

/**
 * The glossary route.
 *
 * Entirely static: all content comes from the local glossary module, with no data fetching, because the vocabulary of
 * the legislative process doesn't change with the news cycle.
 *
 * @returns The glossary page.
 */
export default function LearnPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Civic Basics"
        title="Learn the Language As You Go."
        description="Short, source-conscious explanations that turn legislative jargon into plain English."
      />

      <div className="glossary-grid">
        {glossary.map(
          (entry: GlossaryTerm): JSX.Element => (
            <article className="glossary-entry" key={entry.term}>
              <p className="section-kicker">{entry.term}</p>
              <h2>{entry.plainEnglish}</h2>
              <p>{entry.detail}</p>
            </article>
          ),
        )}
      </div>

      <CalloutCard
        body="Walk through the same five stages that Bill Journey tracks on a real record."
        heading="The Path From an Introduced Bill to a Public Law."
        headingId="next-lesson-heading"
        href="/learn/how-a-bill-becomes-law"
        icon={BookOpenCheck}
        kicker="Lesson 1"
        linkIcon={ArrowUpRight}
        linkLabel="Start the Lesson"
        spacing="flush"
      />
    </SiteShell>
  );
}
