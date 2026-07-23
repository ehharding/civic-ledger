import { ArrowRight, BookOpenCheck, CircleHelp, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillCard } from "@/components/bill-card";
import { BillJourney } from "@/components/bill-journey";
import { DataSourceNotice } from "@/components/data-source-notice";
import { SiteShell } from "@/components/site-shell";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** Home route content: hero, a featured bill's journey, the three most recent bills, and static trust/learn sections. */
export function HomePage({ snapshot }: { snapshot: CongressSnapshot }): JSX.Element {
  const featuredBill: LegislativeBill | undefined = snapshot.bills[0];
  const currentCongress: number = getCurrentCongress();

  return (
    <SiteShell>
      <section className="hero-grid" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">{formatOrdinal(currentCongress)} Congress · Legislative Guide</p>
          <h1 id="home-title">See Congress in Context.</h1>
          <p className="hero-copy__lede">
            Follow the work of Congress with a clearer sense of what each action means, where a bill is headed, and how
            to verify it for yourself.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" href="/bills">
              Explore Bills <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link className="button button--quiet" href="/learn">
              Learn the Process
            </Link>
          </div>
        </div>

        {featuredBill ? (
          <aside className="journey-card" aria-labelledby="featured-journey-title">
            <div className="journey-card__header">
              <div>
                <p className="section-kicker">A bill in motion</p>
                <h2 id="featured-journey-title">
                  {featuredBill.type} {featuredBill.number}
                </h2>
              </div>
              <Scale aria-hidden="true" size={21} />
            </div>
            <p className="journey-card__title">{featuredBill.title}</p>
            <BillJourney stage={featuredBill.stage} compact={false} />
            <p className="journey-card__caption">
              The latest action is interpreted as an educational progress cue, with the official record one click away.
            </p>
          </aside>
        ) : null}
      </section>

      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} />

      <section className="section-heading" aria-labelledby="activity-heading">
        <div>
          <p className="section-kicker">Latest Activity</p>
          <h2 id="activity-heading">Start With What Is Moving.</h2>
        </div>
        <Link href="/bills" className="text-link">
          Browse All Records <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="activity-grid" aria-label="Recent bill activity">
        {snapshot.bills.slice(0, 3).map(
          (bill: LegislativeBill): JSX.Element => (
            <BillCard bill={bill} key={`${bill.congress}-${bill.type}-${bill.number}`} />
          ),
        )}
      </section>

      <section className="learn-strip" aria-labelledby="learn-heading">
        <div className="learn-strip__icon">
          <BookOpenCheck aria-hidden="true" size={23} />
        </div>
        <div>
          <p className="section-kicker">Civic basics</p>
          <h2 id="learn-heading">Understand the Verbs Behind the Headlines.</h2>
          <p>
            “Referred,” “Reported,” and “Passed” mean different things. The learning hub makes the pathway legible
            without dumbing it down.
          </p>
        </div>
        <Link href="/learn" className="secondary-link">
          Visit the Glossary <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="trust-grid" aria-label="Product principles">
        <article>
          <Landmark aria-hidden="true" size={20} />
          <h2>Source-Linked</h2>
          <p>Every record leaves a path back to Congress.gov.</p>
        </article>
        <article>
          <CircleHelp aria-hidden="true" size={20} />
          <h2>Plain English</h2>
          <p>Explanations teach the process beside the data.</p>
        </article>
        <article>
          <Scale aria-hidden="true" size={20} />
          <h2>Nonpartisan by Design</h2>
          <p>Clarity and provenance—not persuasion—are the product.</p>
        </article>
      </section>
    </SiteShell>
  );
}
