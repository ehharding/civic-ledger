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

/** How many amendments show before a disclosure. The highest limit, since most rows are a single line. */
const AMENDMENT_PREVIEW_LIMIT: number = 15;

/**
 * One amendment offered to the bill: citation, purpose, and latest action. The only row on the page that links outward
 * (to Congress.gov), since amendments have no page here. Most rows carry no purpose — the endpoint rarely sends
 * one — so none is rendered rather than a placeholder.
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
 * The amendments offered to a bill, in the publisher's order (entries carry no meaningful date to sort by).
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
