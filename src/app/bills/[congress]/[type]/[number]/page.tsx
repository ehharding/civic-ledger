import { ArrowUpRight, ChevronLeft, ExternalLink, Landmark } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { DataSourceNotice } from "@/components/data-source-notice";
import { SiteShell } from "@/components/site-shell";
import { getBillById } from "@/lib/congress/client";
import { previewBills } from "@/lib/congress/fixtures";
import { billStageLabels, type LegislativeBill } from "@/lib/congress/types";

type BillPageProps = {
  params: Promise<{ congress: string; type: string; number: string }>;
};

/**
 * Pre-renders the preview bills at build time. In the default server build this is just a perf win (other bills
 * still resolve live, on demand).
 * In a static export (STATIC_EXPORT=true, no API key), these are the *only* bill pages that can exist, since a
 * static export has no server to look anything else up on request.
 */
export function generateStaticParams(): { congress: string; type: string; number: string }[] {
  return previewBills.map((bill: LegislativeBill): { congress: string; type: string; number: string } => ({
    congress: String(bill.congress),
    type: bill.type.toLowerCase(),
    number: bill.number,
  }));
}

/**
 * Individual bill record route. Resolves the bill via a direct lookup (`getBillById`) rather than filtering the
 * homepage snapshot, so any real bill number works — not just the dozen most recently returned by the list endpoint.
 * Renders the 404 page (via `notFound()`) when the lookup comes back empty.
 */
export default async function BillPage({ params }: BillPageProps): Promise<JSX.Element> {
  const route: { congress: string; type: string; number: string } = await params;
  const { bill, source, notice } = await getBillById(route);

  if (!bill) notFound();

  return (
    <SiteShell>
      <div className="bill-backlink">
        <Link href="/bills">
          <ChevronLeft aria-hidden="true" size={16} /> All Bills
        </Link>
      </div>

      <section className="bill-detail-hero" aria-labelledby="bill-title">
        <p className="eyebrow">
          {bill.type} {bill.number} · {bill.congress}th Congress
        </p>
        <h1 id="bill-title">{bill.title}</h1>
        <div className="bill-detail-meta">
          <span className="stage-label">{billStageLabels[bill.stage]}</span>
          {bill.policyArea ? <span>{bill.policyArea}</span> : null}
          <span>Origin: {bill.originChamber}</span>
        </div>
      </section>

      <DataSourceNotice source={source} notice={notice} />

      <div className="detail-grid">
        <section className="detail-panel" aria-labelledby="journey-heading">
          <p className="section-kicker">How This Moves</p>
          <h2 id="journey-heading">The Bill’s Journey</h2>
          <p className="muted-copy">
            This Is an Orientation Aid, Not an Official Legal Status. Read the Latest Action and Primary Source
            Alongside It.
          </p>
          <BillJourney stage={bill.stage} compact={false} />
        </section>

        <aside className="detail-panel detail-panel--accent" aria-labelledby="next-heading">
          <p className="section-kicker">Latest Action</p>
          <h2 id="next-heading">What Happened Most Recently</h2>
          <p className="latest-action-copy">{bill.latestAction.text}</p>
          {bill.latestAction.date ? <p className="date-label">Recorded {formatDate(bill.latestAction.date)}</p> : null}
          <a className="text-link" href={bill.officialUrl} target="_blank" rel="noreferrer">
            Open the Official Record <ExternalLink aria-hidden="true" size={15} />
          </a>
        </aside>
      </div>

      <section className="reading-card" aria-labelledby="reading-heading">
        <div className="reading-card__icon">
          <Landmark aria-hidden="true" size={22} />
        </div>
        <div>
          <p className="section-kicker">Read It With Context</p>
          <h2 id="reading-heading">A Record Is a Starting Point, Not the Whole Story.</h2>
          <p>
            Use the Official Source for Definitive Text and Actions. Civic Ledger Will Later Layer in Source-Linked
            Explainers, Committee Context, and Update Alerts Without Obscuring the Original Record.
          </p>
        </div>
        <Link href="/learn" className="secondary-link">
          Learn the Terms <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </section>
    </SiteShell>
  );
}

/** Formats an ISO `YYYY-MM-DD` date for display (e.g. "July 14, 2026"). Falls back to the raw string if unparseable. */
function formatDate(value: string): string {
  const date: Date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.valueOf())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
