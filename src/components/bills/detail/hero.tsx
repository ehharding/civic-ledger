import type { JSX } from "react";

import { BillJourney } from "@/components/bills/bill-journey";
import { GlossaryProse } from "@/components/learn/glossary-prose";
import { DetailPanel } from "@/components/ui/detail-panel";
import { OutboundLink } from "@/components/ui/outbound-link";
import { RecordLink } from "@/components/ui/record-link";
import { type BillStage, billStageLabels, formatEnactedLaw, type LegislativeBill } from "@/lib/congress/bills/model";
import { formatDate, formatOrdinal, pluralize } from "@/lib/format";
import { memberHref } from "@/lib/routes";

// The three sections at the top of a bill's page, read from the bill record itself (so never empty): what the bill is,
// where it has got to, and what happened to it last.

/** Props for {@link BillHero}. */
type BillHeroProps = {
  /** The record being shown. */
  bill: LegislativeBill;
  /** The stage resolved from the action history, which the label reads rather than `bill.stage`. */
  stage: BillStage;
};

/**
 * The bill's identity: citation, title, and the facts that qualify it.
 *
 * @param props - {@link BillHeroProps}.
 * @returns The hero section.
 * @see resolveBillStage
 */
export function BillHero({ bill, stage }: BillHeroProps): JSX.Element {
  return (
    <section className="bill-detail-hero" aria-labelledby="bill-title">
      <p className="eyebrow">
        {bill.type} {bill.number} · {formatOrdinal(bill.congress)} Congress
      </p>
      <h1 id="bill-title">{bill.title}</h1>
      <div className="bill-detail-meta">
        <span className="stage-label">{billStageLabels[stage]}</span>
        {/* The citation Congress.gov publishes on the record itself, not one this app assembled from a stage. It is the
            one thing on this page that settles what became of the bill outright, so it sits beside the stage
            cue — which is explicitly an orientation aid — rather than somewhere further down. */}
        {bill.enactedLaw ? <span className="law-label">{formatEnactedLaw(bill.enactedLaw)}</span> : null}
        {bill.policyArea ? <span>{bill.policyArea}</span> : null}
        <span>Origin: {bill.originChamber}</span>
        {bill.introducedDate ? <span>Introduced {formatDate(bill.introducedDate)}</span> : null}
        {bill.sponsor ? (
          <span>
            Sponsor:{" "}
            {bill.sponsor.bioguideId ? (
              // Links to the sponsor's page here, which carries the official biography link onward.
              <RecordLink className="text-link" href={memberHref(bill.sponsor.bioguideId)}>
                {bill.sponsor.fullName}
              </RecordLink>
            ) : (
              bill.sponsor.fullName
            )}
          </span>
        ) : null}
        {typeof bill.cosponsorTally?.current === "number" ? (
          <span>
            {bill.cosponsorTally.current} <GlossaryProse text={pluralize(bill.cosponsorTally.current, "Cosponsor")} />
          </span>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The stepper, with the standing caveat that it is an orientation aid rather than a legal status.
 *
 * @param stage - The stage resolved from the action history.
 * @returns The journey panel.
 * @see resolveBillStage
 */
export function JourneyPanel({ stage }: { stage: BillStage }): JSX.Element {
  return (
    <DetailPanel headingId="journey-heading" kicker="How This Moves" heading="The Bill’s Journey">
      <p className="muted-copy">
        This is an orientation aid, not an official legal status. Read the latest action and primary source alongside
        it.
      </p>
      <BillJourney stage={stage} compact={false} />
    </DetailPanel>
  );
}

/**
 * The most recent line of Congress's own record, and the link out to it.
 *
 * @param bill - The record being shown.
 * @returns The latest-action panel.
 */
export function LatestActionPanel({ bill }: { bill: LegislativeBill }): JSX.Element {
  return (
    <DetailPanel
      accent
      as="aside"
      heading="What Happened Most Recently"
      headingId="next-heading"
      kicker="Latest Action"
    >
      {/* The one line on this page written in Congress's own voice rather than this app's — "Referred to the Committee
          on…", "Passed Senate without amendment" — which makes it the place a reader is most likely to hit a word they
          don't have. See GlossaryProse. */}
      <p className="latest-action-copy">
        <GlossaryProse text={bill.latestAction.text} />
      </p>
      {bill.latestAction.date ? <p className="date-label">Recorded {formatDate(bill.latestAction.date)}</p> : null}
      <OutboundLink href={bill.officialUrl}>Open the Official Record</OutboundLink>
    </DetailPanel>
  );
}
