import { ArrowUpRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { billStageLabels, type LegislativeBill } from "@/lib/congress/types";

/** Compact bill summary card used in the directory grid and the homepage's "Latest Activity" section. */
export function BillCard({ bill }: { bill: LegislativeBill }): JSX.Element {
  const href: Route = `/bills/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}` as Route;

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
