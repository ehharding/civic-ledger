import type { JSX } from "react";

import { type BillSectionProps, DisclosedList } from "@/components/bills/detail/section";
import { GlossaryProse } from "@/components/learn/glossary-prose";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { RecordLink } from "@/components/ui/record-link";
import {
  billIdentityKey,
  describeBillCollection,
  type RelatedBill,
  type RelatedBillRelationship,
} from "@/lib/congress/bills/model";
import { formatOrdinal } from "@/lib/format";
import { billHref } from "@/lib/routes";

/** How many related measures show before a disclosure. Lower than the cosponsor limit, since these rows are taller. */
const RELATED_BILL_PREVIEW_LIMIT: number = 9;

/**
 * How one related measure relates to this one, with the body that said so named.
 *
 * @param relationships - Every recorded statement about the pair.
 * @returns e.g., `"Identical bill (CRS)"`, joined by middots, or `""` when the record named none.
 */
function describeRelationships(relationships: RelatedBillRelationship[]): string {
  return relationships
    .map((relationship: RelatedBillRelationship): string =>
      relationship.identifiedBy ? `${relationship.type} (${relationship.identifiedBy})` : relationship.type,
    )
    .join(" · ");
}

/**
 * One related measure: identity, title, relationship, and latest action. Each relationship names who identified it
 * (CRS, House, or Senate), since relatedness is an editorial judgment rather than a legislative act.
 *
 * @param measure - The related measure to render.
 * @returns The row.
 */
function RelatedBillRow({ measure }: { measure: RelatedBill }): JSX.Element {
  const relationships: string = describeRelationships(measure.relationships);

  return (
    <li>
      <p className="related-bill-list__identity">
        <RecordLink className="text-link" href={billHref(measure)}>
          {measure.type} {measure.number}
        </RecordLink>
        {/* Always printed rather than guarded: `congress` is required on the model, and a related measure can sit in a
            different Congress from the bill pointing at it, so the number is doing real work here. */}
        <span className="date-label"> · {formatOrdinal(measure.congress)} Congress</span>
      </p>
      <p className="related-bill-list__title">{measure.title}</p>
      {relationships.length > 0 ? <p className="date-label">{relationships}</p> : null}
      {measure.latestAction ? (
        // The other measure's own words, so they get the same glossary treatment this bill's latest action does.
        <p className="related-bill-list__action">
          <GlossaryProse text={measure.latestAction.text} />
        </p>
      ) : null}
    </li>
  );
}

/**
 * The other measures Congress.gov records as related to this bill (e.g., "is there a Senate version?"), each linking to
 * its page here, in the publisher's order.
 *
 * @param related - The related measures, in the publisher's order.
 * @returns The list, its tail behind a disclosure.
 */
function RelatedBillList({ related }: { related: RelatedBill[] }): JSX.Element {
  return (
    <DisclosedList
      items={related}
      keyFor={billIdentityKey}
      limit={RELATED_BILL_PREVIEW_LIMIT}
      listClassName="related-bill-list"
      moreLabel={(remaining: number): string => `Show the Remaining ${remaining} Related Measures`}
      renderItem={(measure: RelatedBill): JSX.Element => <RelatedBillRow measure={measure} />}
    />
  );
}

/**
 * The measures Congress.gov records as related to this one.
 *
 * @param props - @see BillSectionProps
 * @returns The related-measures panel.
 */
export function RelatedPanel({ resource, published, source }: BillSectionProps<RelatedBill>): JSX.Element {
  const { entries: related, unavailable } = resource;

  return (
    <DetailPanel headingId="related-heading" kicker="Elsewhere in Congress" heading="Related Measures">
      {related.length > 0 ? (
        <>
          <p className="muted-copy">
            {describeBillCollection({ shown: related.length, published, noun: "related measure" })} Each is listed with
            the body that identified the relationship — the Congressional Research Service, the House, or the Senate —
            because relating two measures is a judgment someone made rather than something the bills themselves record.
            They are in Congress.gov’s own order, which the API documents no meaning for, so neither end of this list is
            the most significant.
          </p>
          <RelatedBillList related={related} />
        </>
      ) : (
        <EmptySectionNote
          absence="Congress.gov records no measure as related to this one. Most bills have no companion, so this is an ordinary state rather than a gap."
          previewLead="Related measures appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Related measures are"
          unavailableSubject="any measure is recorded as related to this one"
        />
      )}
    </DetailPanel>
  );
}
