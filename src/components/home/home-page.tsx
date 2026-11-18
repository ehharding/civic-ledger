import { ArrowRight, BookOpenCheck, CircleHelp, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillCard } from "@/components/bills/bill-card";
import { BillJourney } from "@/components/bills/bill-journey";
import { SiteShell } from "@/components/layout/site-shell";
import { CongressSeatingChart } from "@/components/members/congress-seating-chart";
import { CalloutCard } from "@/components/ui/callout-card";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { RecordLink } from "@/components/ui/record-link";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  billIdentityKey,
  type CongressSnapshot,
  compareBillsByActivity,
  type LegislativeBill,
} from "@/lib/congress/bills/model";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { type CongressComposition, compositionForSeating } from "@/lib/congress/members/model";
import { formatOrdinal } from "@/lib/format";
import { billHref } from "@/lib/routes";

/** Props for {@link HomePage}. */
type HomePageProps = {
  /** Both chambers' membership, for the seating chart. */
  composition: CongressComposition;
  /** The current Congress's bills. Ordered here by latest action rather than taken as it arrives. */
  snapshot: CongressSnapshot;
};

/**
 * Home route content.
 *
 * The Congress named in the hero comes from {@link getCurrentCongress} rather than from the snapshot's bills, since the
 * bill list can include older Congresses' recently updated records.
 *
 * The featured card and the activity grid draw from one list ordered by legislative activity, and the grid starts after
 * the featured bill so it isn't shown twice above the fold.
 *
 * @param props - {@link HomePageProps}.
 * @returns The hero and featured bill journey, the chamber diagram, the next three bills by activity, and the static
 *   learn/trust sections.
 * @see compareBillsByActivity for why the fetch order is a near miss for what this page claims.
 */
export function HomePage({ composition, snapshot }: HomePageProps): JSX.Element {
  // Both the featured card and the activity grid below read off this rather than off `snapshot.bills` directly. The
  // snapshot arrives ordered by Congress.gov's `updateDate`, which is when a row was last touched and not when anything
  // happened — near enough to pick a recent slice out of eighteen thousand records, not near enough to put an April
  // action above an August one under a heading that says "Latest Activity". See compareBillsByActivity.
  const byActivity: LegislativeBill[] = [...snapshot.bills].sort(compareBillsByActivity);
  const featuredBill: LegislativeBill | undefined = byActivity[0];
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
            <Link className="button button--secondary" href="/learn">
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
              <RecordLink href={billHref(featuredBill)}>{featuredBill.title}</RecordLink>
            </p>
            <BillJourney stage={featuredBill.stage} compact={false} />
            <p className="journey-card__caption">
              The latest action is interpreted as an educational progress cue, with the official record one click away.
            </p>
            <RecordLink className="text-link journey-card__link" href={billHref(featuredBill)}>
              View This Bill <ArrowRight aria-hidden="true" size={15} />
            </RecordLink>
          </aside>
        ) : null}
      </section>

      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} retrievedAt={snapshot.retrievedAt} />

      <CongressSeatingChart composition={compositionForSeating(composition)} />

      <SectionHeading
        as="section"
        heading="Start With What Is Moving."
        headingId="activity-heading"
        kicker="Latest Activity"
      >
        <Link href="/bills" className="text-link">
          Browse All Records <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </SectionHeading>

      <section className="activity-grid" aria-label="Recent bill activity">
        {byActivity.slice(1, 4).map(
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
