import { ArrowUpRight, ChevronLeft, Landmark } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { CalloutCard } from "@/components/callout-card";
import { DataSourceNotice } from "@/components/data-source-notice";
import { OutboundLink } from "@/components/outbound-link";
import { SiteShell } from "@/components/site-shell";
import {
  type BillSummary,
  type BillTextVersion,
  billStageLabels,
  type CongressSnapshot,
  type LegislativeBill,
} from "@/lib/congress/types";
import { formatDate, formatOrdinal, pluralize } from "@/lib/format";
import { memberHref } from "@/lib/member-route";

/** Props for {@link BillDetail} — everything the bill detail route resolves server-side. */
type BillDetailProps = {
  bill: LegislativeBill;
  /** Whether this record is live Congress.gov data or a labeled preview fixture. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* preview data is being shown, when it is. */
  notice?: string;
  /** When this bill's data was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  /** Every CRS summary on file for this bill, most recent first. */
  summaries: BillSummary[];
  /** Every official text version on file for this bill, most recent first. */
  textVersions: BillTextVersion[];
};

/**
 * The caption above a summary, stating who wrote it and which version of the bill it describes.
 *
 * Preview summaries are captioned as illustrative rather than credited to the Congressional Research Service —
 * attributing invented text to a real institution is exactly the kind of accidental misinformation the preview-data
 * policy exists to prevent.
 *
 * @param summary - The summary being captioned.
 * @param source - Whether this record is live or preview data.
 * @returns The caption line.
 */
function SummaryCaption({
  summary,
  source,
}: {
  summary: BillSummary;
  source: CongressSnapshot["source"];
}): JSX.Element {
  if (source === "preview") return <p className="date-label">Illustrative preview summary — not a real CRS summary.</p>;

  return (
    <p className="date-label">
      Congressional Research Service summary — {summary.actionDesc}
      {summary.actionDate ? `, ${formatDate(summary.actionDate)}` : ""}
    </p>
  );
}

/**
 * Renders one summary's sanitized HTML.
 *
 * @param summary - The summary to render. Its `html` was already run through `sanitizeSummaryHtml` in the adapter
 *   (allow-listed tags, validated hrefs only) before it reached the app's model, so no unsanitized markup can arrive
 *   here.
 * @returns The summary body.
 */
function SummaryBody({ summary }: { summary: BillSummary }): JSX.Element {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: html is sanitized by sanitizeSummaryHtml in the adapter.
    <div className="summary-body" dangerouslySetInnerHTML={{ __html: summary.html }} />
  );
}

/**
 * Full bill record page.
 *
 * Purely presentational: every value is resolved by the route (`page.tsx`) and passed in, so this component has no
 * fetching, no environment access, and nothing that behaves differently between a live and a preview render except the
 * wording it chooses.
 *
 * @param props - @see BillDetailProps
 * @returns The hero (identity, stage, sponsor and cosponsor meta), the `BillJourney` stepper, the latest action with a
 *   link to the official record, the CRS summaries, every official text version, and the closing context card.
 */
export function BillDetail({
  bill,
  source,
  notice,
  retrievedAt,
  summaries,
  textVersions,
}: BillDetailProps): JSX.Element {
  const [summary, ...earlierSummaries]: BillSummary[] = summaries;

  return (
    <SiteShell>
      <div className="bill-backlink">
        <Link href="/bills">
          <ChevronLeft aria-hidden="true" size={16} /> All Bills
        </Link>
      </div>

      <section className="bill-detail-hero" aria-labelledby="bill-title">
        <p className="eyebrow">
          {bill.type} {bill.number} · {formatOrdinal(bill.congress)} Congress
        </p>
        <h1 id="bill-title">{bill.title}</h1>
        <div className="bill-detail-meta">
          <span className="stage-label">{billStageLabels[bill.stage]}</span>
          {bill.policyArea ? <span>{bill.policyArea}</span> : null}
          <span>Origin: {bill.originChamber}</span>
          {bill.introducedDate ? <span>Introduced {formatDate(bill.introducedDate)}</span> : null}
          {bill.sponsor ? (
            <span>
              Sponsor:{" "}
              {bill.sponsor.bioguideId ? (
                // Links inward rather than straight out to the Biographical Directory: the sponsor's own page collects
                // their seat, service record, and the rest of what they've introduced — and carries the official
                // biography link onward, so nothing is lost by making this the first stop instead of the last.
                <Link className="text-link" href={memberHref(bill.sponsor.bioguideId)}>
                  {bill.sponsor.fullName}
                </Link>
              ) : (
                bill.sponsor.fullName
              )}
            </span>
          ) : null}
          {typeof bill.cosponsorCount === "number" ? (
            <span>
              {bill.cosponsorCount} {pluralize(bill.cosponsorCount, "Cosponsor")}
            </span>
          ) : null}
        </div>
      </section>

      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />

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
          {bill.latestAction.date ? <p className="date-label">Recorded {formatDate(bill.latestAction.date)}</p> : null}
          <OutboundLink href={bill.officialUrl}>Open the Official Record</OutboundLink>
        </aside>
      </div>

      <div className="detail-grid">
        <section className="detail-panel" aria-labelledby="summary-heading">
          <p className="section-kicker">In Plain English</p>
          <h2 id="summary-heading">What This Bill Would Do</h2>
          {summary ? (
            <>
              <SummaryCaption summary={summary} source={source} />
              <SummaryBody summary={summary} />
              {earlierSummaries.length > 0 ? (
                <>
                  <p className="muted-copy">
                    This is the most recent of {summaries.length} summaries the Congressional Research Service has
                    published for this bill; earlier ones may describe an earlier version of the text.
                  </p>
                  {/* Kept collapsed rather than dropped: an earlier summary isn't stale, it's an accurate description
                      of a real earlier version of the bill, and comparing the two is one of the clearest ways to see
                      what a chamber actually changed. */}
                  <details className="summary-history">
                    <summary className="summary-history__toggle">
                      Read the {earlierSummaries.length} Earlier{" "}
                      {pluralize(earlierSummaries.length, "Summary", "Summaries")}
                    </summary>
                    <ol className="summary-history__list">
                      {earlierSummaries.map(
                        (earlier: BillSummary): JSX.Element => (
                          <li key={`${earlier.versionCode}-${earlier.actionDate ?? earlier.actionDesc}`}>
                            <SummaryCaption summary={earlier} source={source} />
                            <SummaryBody summary={earlier} />
                          </li>
                        ),
                      )}
                    </ol>
                  </details>
                </>
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
              {textVersions.map(
                (version: BillTextVersion, index: number): JSX.Element => (
                  <li key={`${version.type}-${version.date ?? index}`}>
                    <p className="text-version-list__type">
                      {version.type}
                      {version.date ? ` · ${formatDate(version.date)}` : ""}
                    </p>
                    <div className="text-version-list__formats">
                      {version.formats.map((format) => (
                        <OutboundLink key={format.url} href={format.url} iconSize={13}>
                          {format.type}
                        </OutboundLink>
                      ))}
                    </div>
                  </li>
                ),
              )}
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

      <CalloutCard
        body="The summary above is written by the Congressional Research Service, not Civic Ledger — use the linked full text for anything definitive. Committee context and update alerts are next, without obscuring the original record."
        heading="A Record Is a Starting Point, Not the Whole Story."
        headingId="reading-heading"
        href="/learn"
        icon={Landmark}
        kicker="Read It With Context"
        linkIcon={ArrowUpRight}
        linkLabel="Learn the Terms"
      />
    </SiteShell>
  );
}
