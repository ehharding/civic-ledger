import { ArrowUpRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { BillJourney } from "@/components/bills/bill-journey";
import { billStageLabels, type LegislativeBill } from "@/lib/congress/bills/model";
import { formatDate } from "@/lib/format";
import { billHref } from "@/lib/routes";

/**
 * Compact bill summary card, used in the directory grid, the homepage's "Latest Activity" section, and a member's
 * sponsored and cosponsored lists.
 *
 * Both the title and the corner arrow link to the same record: the title because it's what a person reads and reaches
 * for, the arrow because a card whose only target is a long wrapped headline is awkward to hit. The arrow carries an
 * explicit `aria-label` so the two links aren't announced as an ambiguous pair.
 *
 * **The action is dated, in the bill page's own words.** Every one of the three surfaces above leads with recency — the
 * homepage section is titled "Latest Activity", and the directory is ordered by it — so a card stating what happened
 * and not when was asking the reader to take that ordering on trust. `Recorded {date}` is the spelling the bill page's
 * `LatestActionPanel` already uses for the same field, so the card and the page it opens name it the same way rather
 * than each inventing a phrase.
 *
 * @param bill - The bill to summarize.
 * @returns The card: identifier and stage, linked title, latest action and its date, compact journey stepper, and
 *   policy area where the record carries one.
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
      {bill.latestAction.date ? (
        <p className="bill-card__action-date">Recorded {formatDate(bill.latestAction.date)}</p>
      ) : null}
      <BillJourney stage={bill.stage} compact />
      <div className="bill-card__footer">
        {/*
         * Rendered only where there is one, rather than behind a "Policy Area Pending" placeholder.
         *
         * Congress.gov publishes `policyArea` on the *detail* endpoint and not on the list endpoint every one of this
         * card's three surfaces reads from, so the placeholder was not a rare fallback — it was the footer's live text,
         * on every card, permanently. A label that always reads the same is not information, and "Pending" additionally
         * suggested a value on its way that nothing was waiting for. The preview fixtures do carry policy areas, which
         * is why this is a conditional rather than a deletion.
         */}
        {bill.policyArea ? <span>{bill.policyArea}</span> : null}
        <Link href={href} aria-label={`Open ${bill.type} ${bill.number}`}>
          <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </article>
  );
}
