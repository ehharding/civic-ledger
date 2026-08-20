import { ArrowRight, BookOpenCheck, CircleHelp, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillCard } from "@/components/bills/bill-card";
import { BillJourney } from "@/components/bills/bill-journey";
import { SiteShell } from "@/components/layout/site-shell";
import { CongressSeatingChart } from "@/components/members/congress-seating-chart";
import { CalloutCard } from "@/components/ui/callout-card";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { billHref } from "@/lib/bill-route";
import { billIdentityKey, type CongressSnapshot, type LegislativeBill } from "@/lib/congress/bills/model";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { CongressComposition } from "@/lib/congress/members/model";
import { formatOrdinal } from "@/lib/format";

/**
 * Home route content.
 *
 * The Congress named in the hero comes from {@link getCurrentCongress} rather than from the snapshot's bills: the bill
 * list endpoint can surface a record from an older Congress whose data happened to update recently, and reading the
 * headline number off whatever arrived would make the page occasionally, confidently wrong about what year it is.
 *
 * @param composition - Both chambers' membership, for the seating chart.
 * @param snapshot - The current Congress's bills, whose first entry becomes the featured record.
 * @returns The hero and featured bill journey, the chamber diagram, the three most recent bills, and the static
 *   learn/trust sections.
 */
export function HomePage({
  composition,
  snapshot,
}: {
  composition: CongressComposition;
  snapshot: CongressSnapshot;
}): JSX.Element {
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
                <p className="section-kicker">A Bill in Motion</p>
                <h2 id="featured-journey-title">
                  {featuredBill.type} {featuredBill.number}
                </h2>
              </div>
              <Scale aria-hidden="true" size={21} />
            </div>
            <p className="journey-card__title">
              <Link href={billHref(featuredBill)}>{featuredBill.title}</Link>
            </p>
            <BillJourney stage={featuredBill.stage} compact={false} />
            <p className="journey-card__caption">
              The latest action is interpreted as an educational progress cue, with the official record one click away.
            </p>
            <Link className="text-link journey-card__link" href={billHref(featuredBill)}>
              View This Bill <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </aside>
        ) : null}
      </section>

      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} retrievedAt={snapshot.retrievedAt} />

      <CongressSeatingChart composition={composition} />

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
            <BillCard bill={bill} key={billIdentityKey(bill)} />
          ),
        )}
      </section>

      <CalloutCard
        body="“Referred,” “Reported,” and “Passed” mean different things. The learning hub makes the pathway legible without dumbing it down."
        heading="Understand the Verbs Behind the Headlines."
        headingId="learn-heading"
        href="/learn"
        icon={BookOpenCheck}
        kicker="Civic Basics"
        linkIcon={ArrowRight}
        linkLabel="Visit the Glossary"
        spacing="spacious"
      />

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
          <p>Clarity and provenance — not persuasion — are the product.</p>
        </article>
      </section>
    </SiteShell>
  );
}
