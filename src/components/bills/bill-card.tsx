import { ArrowUpRight } from "lucide-react";
import type { Route } from "next";
import type { JSX } from "react";

import { BillJourney } from "@/components/bills/bill-journey";
import { RecordLink } from "@/components/ui/record-link";
import { billStageLabels, type LegislativeBill } from "@/lib/congress/bills/model";
import { formatDate } from "@/lib/format";
import { billHref } from "@/lib/routes";

/** Props for {@link BillCard}. */
type BillCardProps = {
  /** The bill to summarize. */
  bill: LegislativeBill;
};

/**
 * Compact bill summary card, for the directory, the home page's "Latest Activity", and member legislation lists.
 *
 * The title and the corner arrow (an easier target, with its own `aria-label`) both link to the record. The latest
 * action is dated "Recorded {date}", matching the bill page, since every surface orders by recency.
 *
 * @param props - {@link BillCardProps}.
 * @returns The card: identifier and stage, linked title, latest action and its date, compact journey stepper, and
 *   policy area where the record carries one.
 */
export function BillCard({ bill }: BillCardProps): JSX.Element {
  const href: Route = billHref(bill);

  return (
    <article className="bill-card">
      <div className="bill-card__topline">
        <p className="bill-id">
          {bill.type} {bill.number}
        </p>
        <span className="stage-label">{billStageLabels[bill.stage]}</span>
      </div>
      <h3>
        <RecordLink href={href}>{bill.title}</RecordLink>
      </h3>
      <p className="bill-card__action">{bill.latestAction.text}</p>
      {bill.latestAction.date ? (
        <p className="bill-card__action-date">Recorded {formatDate(bill.latestAction.date)}</p>
      ) : null}
      <BillJourney stage={bill.stage} compact />
      <div className="bill-card__footer">
        {/* Only the detail endpoint carries `policyArea` (the fixtures do too), so list cards usually omit it. */}
        {bill.policyArea ? <span>{bill.policyArea}</span> : null}
        <RecordLink href={href} aria-label={`Open ${bill.type} ${bill.number}`}>
          <ArrowUpRight aria-hidden="true" size={17} />
        </RecordLink>
      </div>
    </article>
  );
}
