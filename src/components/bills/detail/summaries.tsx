import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { type BillSummary, type CongressSnapshot, describeBillCollection } from "@/lib/congress/bills/model";
import { formatDate, pluralize } from "@/lib/format";

/** Props for {@link SummaryCaption}. */
type SummaryCaptionProps = {
  /** The summary being captioned. */
  summary: BillSummary;
  /** Whether this record is live or preview data. */
  source: CongressSnapshot["source"];
};

/**
 * The caption above a summary: who wrote it and which bill version it describes. Preview summaries are captioned as
 * illustrative, never credited to CRS.
 *
 * @param props - {@link SummaryCaptionProps}.
 * @returns The caption line.
 * @see docs/data-policy.md
 */
function SummaryCaption({ summary, source }: SummaryCaptionProps): JSX.Element {
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
 * @param summary - The summary to render. Its `html` was sanitized by `sanitizeSummaryHtml` in the adapter.
 * @returns The summary body.
 */
function SummaryBody({ summary }: { summary: BillSummary }): JSX.Element {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: html is sanitized by sanitizeSummaryHtml in the adapter.
    <div className="summary-body" dangerouslySetInnerHTML={{ __html: summary.html }} />
  );
}

/**
 * The CRS summaries: the most recent in full, earlier ones (accurate descriptions of earlier versions, useful for
 * seeing what changed) behind a disclosure.
 *
 * @param props - {@link BillSectionProps}.
 * @returns The summary panel.
 */
export function SummariesPanel({ resource, published, source }: BillSectionProps<BillSummary>): JSX.Element {
  const { entries: summaries, unavailable } = resource;
  const [summary, ...earlierSummaries]: BillSummary[] = summaries;

  return (
    <DetailPanel headingId="summary-heading" kicker="In Plain English" heading="What This Bill Would Do">
      {summary ? (
        <>
          <SummaryCaption summary={summary} source={source} />
          <SummaryBody summary={summary} />
          {earlierSummaries.length > 0 ? (
            <>
              <p className="muted-copy">
                {describeBillCollection({
                  shown: summaries.length,
                  published,
                  noun: "Congressional Research Service summary",
                  pluralNoun: "Congressional Research Service summaries",
                })}{" "}
                The one above is the most recent; earlier ones may describe an earlier version of the text.
              </p>
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
        <EmptySectionNote
          absence="The Congressional Research Service hasn't published a summary for this bill yet."
          previewLead="Summaries appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Summaries are"
          unavailableSubject="the Congressional Research Service has written one"
        />
      )}
    </DetailPanel>
  );
}
