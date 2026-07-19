import { ArrowUpRight, BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { type GlossaryTerm, glossary } from "@/lib/glossary";

export const metadata: Metadata = { title: "Learn" };

/** Static glossary + "what's next" route. All content comes from the local glossary module — no data fetching. */
export default function LearnPage(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Civic Basics"
        title="Learn the Language As You Go."
        description="Short, Source-Conscious Explanations That Turn Legislative Jargon Into Useful Understanding."
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

      <section className="reading-card reading-card--simple" aria-labelledby="next-lesson-heading">
        <div className="reading-card__icon">
          <BookOpenCheck aria-hidden="true" size={22} />
        </div>
        <div>
          <p className="section-kicker">Next Lesson</p>
          <h2 id="next-lesson-heading">The Path From an Introduced Bill to a Public Law.</h2>
          <p>This Foundational Visual Lesson Is the First Planned Editorial Module.</p>
        </div>
        <Link href="/bills" className="secondary-link">
          Explore the Live Flow <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </section>
    </SiteShell>
  );
}
