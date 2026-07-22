import { ArrowRight, BookOpenCheck, CircleHelp, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillCard } from "@/components/bill-card";
import { BillJourney } from "@/components/bill-journey";
import { DataSourceNotice } from "@/components/data-source-notice";
import { SiteShell } from "@/components/site-shell";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";

/** Home route content: hero, a featured bill's journey, the three most recent bills, and static trust/learn sections. */
export function HomePage({ snapshot }: { snapshot: CongressSnapshot }): JSX.Element {
  const featuredBill: LegislativeBill | undefined = snapshot.bills[0];

  return (
    <SiteShell>
      <section className="hero-grid" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">119th Congress · Legislative Guide</p>
          <h1 id="home-title">See Congress in Context.</h1>
          <p className="hero-copy__lede">
            Follow the Work of Congress With a Clearer Sense of What Each Action Means, Where a Bill Is Headed, and How
            To Verify It for Yourself.
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
              The Latest Action Is Interpreted as an Educational Progress Cue, With the Official Record One Click Away.
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
            “Referred,” “Reported,” and “Passed” Mean Different Things. The Learning Hub Makes the Pathway Legible
            Without Dumbing It Down.
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
          <p>Every Record Leaves a Path Back to Congress.gov.</p>
        </article>
        <article>
          <CircleHelp aria-hidden="true" size={20} />
          <h2>Plain English</h2>
          <p>Explanations Teach the Process Beside the Data.</p>
        </article>
        <article>
          <Scale aria-hidden="true" size={20} />
          <h2>Nonpartisan by Design</h2>
          <p>Clarity and Provenance—Not Persuasion—Are the Product.</p>
        </article>
      </section>
    </SiteShell>
  );
}
