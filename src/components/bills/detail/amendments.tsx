import type { JSX } from "react";

import { type BillSectionProps, DisclosedList } from "@/components/bills/detail/section";
import { GlossaryProse } from "@/components/learn/glossary-prose";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { OutboundLink } from "@/components/ui/outbound-link";
import {
  type BillAmendment,
  describeAmendmentDetail,
  describeBillCollection,
  formatAmendmentCitation,
} from "@/lib/congress/bills/model";
import { formatDate } from "@/lib/format";

/**
 * The amendments offered to a bill: the panel, the list, and one amendment's row.
 *
 * The only collection on this page that links *outward*. Cosponsors, committees, and related measures each have a page
 * here that collects more than a row does; an amendment does not, so the honest link is to Congress.gov's own record
 * rather than to a route this app would have to invent. @see AmendmentRow.
 */

/**
 * How many amendments are shown before the rest move behind a disclosure.
 *
 * The highest of the three limits, because the rows are the shortest: most amendments carry no prose at all, so a row
 * is usually one line — a citation and its link. @see BillAmendment. Fifteen fills about the same vertical space as
 * nine related measures, and on a bill where the rows *do* carry purposes it is still short of the point where the
 * section would dominate the page.
 */
const AMENDMENT_PREVIEW_LIMIT: number = 15;

/**
 * One amendment offered to the bill: its citation, what it says it does, and its own latest action.
 *
 * **The link goes outward, and this is the one collection on this page where that is the right direction.** Cosponsors,
 * committees, and related measures all link inward, because each has a page here that collects more than the row does.
 * An amendment has no page here — building one would mean a route, a detail read, and a second set of provenance
 * claims — so the honest link is the one to Congress.gov's own record, which is where a reader was going to end up
 * anyway. @see congressGovAmendmentUrl for how that URL is derived and why it is not guessed.
 *
 * **Most rows are a citation and nothing else, by design rather than by omission.** The endpoint sends a purpose for
 * roughly one entry in fifteen. A row that rendered an empty line where prose would go, or a placeholder standing in
 * for it, would present the record's ordinary shape as a defect in this page.
 *
 * @param amendment - The amendment to render.
 * @returns The row.
 */
function AmendmentRow({ amendment }: { amendment: BillAmendment }): JSX.Element {
  return (
    <li>
      <p className="amendment-list__identity">
        <OutboundLink href={amendment.officialUrl} iconSize={13}>
          {formatAmendmentCitation(amendment)}
        </OutboundLink>
      </p>
      {amendment.purpose ? <p className="amendment-list__purpose">{amendment.purpose}</p> : null}
      {amendment.latestAction ? (
        <p className="amendment-list__action">
          {/* The amendment's own latest action, in Congress's words rather than this app's — so it gets the same
              glossary treatment the bill's latest action and every related measure's does. */}
          <GlossaryProse text={amendment.latestAction.text} />
          {amendment.latestAction.date ? (
            <span className="date-label"> · {formatDate(amendment.latestAction.date)}</span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The amendments offered to a bill, each linking to its own record at Congress.gov.
 *
 * The publisher's own order is kept, since the only date on an entry is the row's last-touched timestamp rather than
 * anything that happened to the amendment. @see getBillAmendments.
 *
 * @param amendments - The amendments, in the publisher's order.
 * @returns The list, its tail behind a disclosure.
 */
function AmendmentList({ amendments }: { amendments: BillAmendment[] }): JSX.Element {
  return (
    <DisclosedList
      items={amendments}
      keyFor={(amendment: BillAmendment): string => `${amendment.congress}-${amendment.type}-${amendment.number}`}
      limit={AMENDMENT_PREVIEW_LIMIT}
      listClassName="amendment-list"
      moreLabel={(remaining: number): string => `Show the Remaining ${remaining} Amendments`}
      renderItem={(amendment: BillAmendment): JSX.Element => <AmendmentRow amendment={amendment} />}
    />
  );
}

/**
 * Every amendment offered to the bill.
 *
 * @param props - @see BillSectionProps
 * @returns The amendments panel.
 */
export function AmendmentsPanel({ resource, published, source }: BillSectionProps<BillAmendment>): JSX.Element {
  const { entries: amendments, unavailable } = resource;
  const withPurpose: number = amendments.filter(
    (amendment: BillAmendment): boolean => amendment.purpose !== undefined,
  ).length;

  return (
    <DetailPanel headingId="amendments-heading" kicker="What Was Proposed to Change It" heading="Amendments">
      {amendments.length > 0 ? (
        <>
          <p className="muted-copy">
            {describeBillCollection({ shown: amendments.length, published, noun: "amendment" })}{" "}
            {describeAmendmentDetail(withPurpose, amendments.length)} They are in Congress.gov’s own order, which the
            API documents no meaning for, so neither end of this list is the most recent. An amendment being offered is
            not an amendment being adopted — most are never voted on.
          </p>
          <AmendmentList amendments={amendments} />
        </>
      ) : (
        <EmptySectionNote
          absence="No amendment was offered to this bill. Most bills never reach a stage where one could be, so this is an ordinary state rather than a gap."
          previewLead="Amendments appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Amendments are"
          unavailableSubject="any amendment was offered to this bill"
        />
      )}
    </DetailPanel>
  );
}
