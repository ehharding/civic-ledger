import { ArrowUpRight, ChevronLeft, ExternalLink, Landmark } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { DataSourceNotice } from "@/components/data-source-notice";
import { SiteShell } from "@/components/site-shell";
import {
  type BillSummary,
  type BillTextVersion,
  billStageLabels,
  type CongressSnapshot,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatDate, formatOrdinal } from "@/lib/format";

type BillDetailProps = {
  bill: LegislativeBill;
  source: CongressSnapshot["source"];
  notice?: string;
  /** Every CRS summary on file for this bill, most recent first. */
  summaries: BillSummary[];
  /** Every official text version on file for this bill, most recent first. */
  textVersions: BillTextVersion[];
};

export function BillDetail({ bill, source, notice, summaries, textVersions }: BillDetailProps): JSX.Element {
  const summary: BillSummary | undefined = summaries[0];

  return (
    <SiteShell>
      <div className="bill-backlink">
        <Link href="/bills">
          <ChevronLeft aria-hidden="true" size={16} /> All Bills
        </Link>
      </div>

      {/* Added Wrapper to handle consistent vertical spacing between sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <section className="bill-detail-hero" aria-labelledby="bill-title">
          <p className="eyebrow">
            {bill.type} {bill.number} · {formatOrdinal(bill.congress)} Congress
          </p>
          <h1 id="bill-title">{bill.title}</h1>
          <div className="bill-detail-meta">
            <span className="stage-label">{billStageLabels[bill.stage]}</span>
            {bill.policyArea ? <span>{bill.policyArea}</span> : null}
            <span>Origin: {bill.originChamber}</span>
            {bill.sponsor ? <span>Sponsor: {bill.sponsor.fullName}</span> : null}
            {typeof bill.cosponsorCount === "number" ? (
              <span>
                {bill.cosponsorCount} cosponsor{bill.cosponsorCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </section>

        <DataSourceNotice source={source} notice={notice} />

        <div className="detail-grid">
          <section className="detail-panel" aria-labelledby="journey-heading">
            <p className="section-kicker">How This Moves</p>
            <h2 id="journey-heading">The Bill’s Journey</h2>
            <p className="muted-copy">
              This is an orientation aid, not an official legal status. Read the latest action and primary source
              alongside it.
            </p>
            <BillJourney stage={bill.stage} compact={false} />
          </section>

          <aside className="detail-panel detail-panel--accent" aria-labelledby="next-heading">
            <p className="section-kicker">Latest Action</p>
            <h2 id="next-heading">What Happened Most Recently</h2>
            <p className="latest-action-copy">{bill.latestAction.text}</p>
            {bill.latestAction.date ? (
              <p className="date-label">Recorded {formatDate(bill.latestAction.date)}</p>
            ) : null}
            <a className="text-link" href={bill.officialUrl} target="_blank" rel="noreferrer">
              Open the Official Record <ExternalLink aria-hidden="true" size={15} />
            </a>
          </aside>
        </div>

        <div className="detail-grid">
          <section className="detail-panel" aria-labelledby="summary-heading">
            <p className="section-kicker">In Plain English</p>
            <h2 id="summary-heading">What This Bill Would Do</h2>
            {summary ? (
              <>
                <p className="date-label">
                  {source === "preview"
                    ? "Illustrative preview summary — not a real CRS summary."
                    : `Congressional Research Service summary — ${summary.actionDesc}${
                        summary.actionDate ? `, ${formatDate(summary.actionDate)}` : ""
                      }`}
                </p>
                {/** biome-ignore lint/security/noDangerouslySetInnerHtml: html is run through sanitizeSummaryHtml (allow-listed tags, validated hrefs only) in client.ts before this is ever set. */}
                <div className="summary-body" dangerouslySetInnerHTML={{ __html: summary.html }} />
                {summaries.length > 1 ? (
                  <p className="muted-copy">
                    This is the most recent of {summaries.length} summaries the Congressional Research Service has
                    published for this bill; earlier ones may describe an earlier version of the text.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted-copy">
                {source === "preview"
                  ? "Summaries appear here once live Congress.gov data is connected."
                  : "The Congressional Research Service hasn't published a summary for this bill yet."}
              </p>
            )}
          </section>

          <aside className="detail-panel detail-panel--accent" aria-labelledby="fulltext-heading">
            <p className="section-kicker">Primary Source</p>
            <h2 id="fulltext-heading">Read the Full Text</h2>
            {textVersions.length > 0 ? (
              <ul className="text-version-list">
                {textVersions.map((version: BillTextVersion, index: number) => (
                  <li key={`${version.type}-${version.date ?? index}`}>
                    <p className="text-version-list__type">
                      {version.type}
                      {version.date ? ` · ${formatDate(version.date)}` : ""}
                    </p>
                    <div className="text-version-list__formats">
                      {version.formats.map((format) => (
                        <a key={format.url} className="text-link" href={format.url} target="_blank" rel="noreferrer">
                          {format.type} <ExternalLink aria-hidden="true" size={13} />
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                {source === "preview"
                  ? "Full-text links appear here once live Congress.gov data is connected."
                  : "Congress.gov hasn't published bill text for this record yet."}
              </p>
            )}
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
              The summary above is written by the Congressional Research Service, not Civic Ledger — use the linked full
              text for anything definitive. Committee context and update alerts are next, without obscuring the original
              record.
            </p>
          </div>
          <Link href="/learn" className="secondary-link">
            Learn the Terms <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}
