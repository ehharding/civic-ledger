import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { OutboundLink } from "@/components/ui/outbound-link";
import { type BillTextFormat, type BillTextVersion, describeBillCollection } from "@/lib/congress/bills/model";
import { formatDate } from "@/lib/format";

/**
 * Every official rendering of a bill's text, linked to Congress.gov rather than re-hosted here.
 *
 * The collection where a gap between the published figure and the shown one is most expected, since a version carrying
 * no linkable rendering is dropped upstream in `mapCongressTextVersion` — a heading with nothing behind it is not a
 * row. Naming both figures is what keeps that drop from reading as the record being shorter than it is.
 */

/**
 * Every official rendering of the bill's text, linked to Congress.gov rather than re-hosted.
 *
 * The collection where a gap between the published figure and the shown one is most expected:
 * `mapCongressTextVersion` drops a version carrying no linkable rendering, since a heading with nothing behind it is
 * not a row. Naming both figures is what keeps that drop from reading as the record being shorter than it is.
 *
 * @param props - @see BillSectionProps
 * @returns The full-text panel.
 */
export function TextVersionsPanel({ resource, published, source }: BillSectionProps<BillTextVersion>): JSX.Element {
  const { entries: textVersions, unavailable } = resource;

  return (
    <DetailPanel accent as="aside" heading="Read the Full Text" headingId="fulltext-heading" kicker="Primary Source">
      {textVersions.length > 0 ? (
        <>
          <p className="muted-copy">
            {describeBillCollection({ shown: textVersions.length, published, noun: "text version" })} Each links to
            Congress.gov’s own documents rather than to text re-hosted here.
          </p>
          <ul className="text-version-list">
            {textVersions.map(
              (version: BillTextVersion, index: number): JSX.Element => (
                <li key={`${version.type}-${version.date ?? index}`}>
                  <p className="text-version-list__type">
                    {version.type}
                    {version.date ? ` · ${formatDate(version.date)}` : ""}
                  </p>
                  <div className="text-version-list__formats">
                    {version.formats.map(
                      (format: BillTextFormat): JSX.Element => (
                        <OutboundLink key={format.url} href={format.url} iconSize={13}>
                          {format.type}
                        </OutboundLink>
                      ),
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        </>
      ) : (
        <EmptySectionNote
          absence="Congress.gov hasn't published bill text for this record yet."
          previewLead="Full-text links appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Full-text links are"
          unavailableSubject="Congress.gov has published any text for this bill"
        />
      )}
    </DetailPanel>
  );
}
