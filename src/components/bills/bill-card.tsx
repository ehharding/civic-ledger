import { ArrowUpRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bills/bill-journey";
import { billStageLabels, type LegislativeBill } from "@/lib/congress/bills/model";
import { billHref } from "@/lib/routes";

/**
 * Compact bill summary card, used in the directory grid and the homepage's "Latest Activity" section.
 *
 * Both the title and the corner arrow link to the same record: the title because it's what a person reads and reaches
 * for, the arrow because a card whose only target is a long wrapped headline is awkward to hit. The arrow carries an
 * explicit `aria-label` so the two links aren't announced as an ambiguous pair.
 *
 * @param bill - The bill to summarize.
 * @returns The card: identifier and stage, linked title, latest action, compact journey stepper, and policy area.
 */
export function BillCard({ bill }: { bill: LegislativeBill }): JSX.Element {
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
        <Link href={href}>{bill.title}</Link>
      </h3>
      <p className="bill-card__action">{bill.latestAction.text}</p>
      <BillJourney stage={bill.stage} compact />
      <div className="bill-card__footer">
        <span>{bill.policyArea ?? "Policy Area Pending"}</span>
        <Link href={href} aria-label={`Open ${bill.type} ${bill.number}`}>
          <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </article>
  );
}
