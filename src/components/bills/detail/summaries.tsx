import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { type BillSummary, type CongressSnapshot, describeBillCollection } from "@/lib/congress/bills/model";
import { formatDate, pluralize } from "@/lib/format";

/**
 * The Congressional Research Service summaries of a bill: the panel, each summary's caption, and its sanitized body.
 *
 * Earlier summaries are kept rather than dropped — one is not stale, it is an accurate description of a real earlier
 * version of the bill, and comparing the two is among the clearest ways to see what a chamber actually changed. The
 * caption is what keeps that honest, and on a preview record it is what keeps invented prose from being credited to a
 * real institution. @see SummaryCaption, and docs/data-policy.md.
 */

/**
 * The caption above a summary, stating who wrote it and which version of the bill it describes.
 *
 * Preview summaries are captioned as illustrative rather than credited to the Congressional Research
 * Service — attributing invented text to a real institution is exactly the kind of accidental misinformation the
 * preview-data policy exists to prevent.
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
 * The CRS summaries: the most recent one in full, with the earlier ones behind a disclosure.
 *
 * Earlier summaries are kept rather than dropped: one isn't stale, it's an accurate description of a real earlier
 * version of the bill, and comparing the two is one of the clearest ways to see what a chamber actually changed.
 *
 * @param props - @see BillSectionProps
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
