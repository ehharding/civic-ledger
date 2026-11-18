import { ArrowUpRight, Landmark } from "lucide-react";
import type { JSX } from "react";

import { ActionsPanel } from "@/components/bills/detail/actions";
import { AmendmentsPanel } from "@/components/bills/detail/amendments";
import { CommitteesPanel } from "@/components/bills/detail/committees";
import { CosponsorsPanel } from "@/components/bills/detail/cosponsors";
import { BillHero, JourneyPanel, LatestActionPanel } from "@/components/bills/detail/hero";
import { RecordedVotesPanel } from "@/components/bills/detail/recorded-votes";
import { RelatedPanel } from "@/components/bills/detail/related";
import { SummariesPanel } from "@/components/bills/detail/summaries";
import { TextVersionsPanel } from "@/components/bills/detail/text-versions";
import { SiteShell } from "@/components/layout/site-shell";
import { CalloutCard } from "@/components/ui/callout-card";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { DetailBackLink } from "@/components/ui/detail-back-link";
import type {
  BillAction,
  BillAmendment,
  BillCosponsor,
  BillStage,
  BillSubResource,
  BillSummary,
  BillTextVersion,
  CongressSnapshot,
  LegislativeBill,
  RelatedBill,
} from "@/lib/congress/bills/model";
import { resolveBillStage } from "@/lib/congress/bills/stage";
import type { BillCommittee } from "@/lib/congress/committees/model";

/** Props for {@link BillDetail} — everything the bill detail route resolves server-side. */
type BillDetailProps = {
  /** The bill itself. */
  bill: LegislativeBill;
  /** Whether this record is live Congress.gov data or a labeled preview fixture. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* preview data is being shown, when it is. */
  notice?: string;
  /** When this bill's data was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  // The collections below are `BillSubResource`s, not bare arrays: an empty list only licenses "none on record" when
  // its request was actually answered.
  /** Every CRS summary on file for this bill, most recent first. */
  summaries: BillSubResource<BillSummary>;
  /** Every official text version on file for this bill, most recent first. */
  textVersions: BillSubResource<BillTextVersion>;
  /** The bill's full action history, most recent first. Empty in preview mode and whenever the fetch failed. */
  actions: BillSubResource<BillAction>;
  /** Every committee that held this bill, in Congress.gov's own order. Empty in preview mode and on failure. */
  committees: BillSubResource<BillCommittee>;
  /**
   * Everyone currently signed on, in the publisher's chronological order. Empty on failure, and in preview mode holds
   * the labeled fixture cosponsors rather than nothing.
   *
   * @see previewCosponsors
   */
  cosponsors: BillSubResource<BillCosponsor>;
  /** Every measure recorded as related to this one, in the publisher's order. Empty in preview mode and on failure. */
  related: BillSubResource<RelatedBill>;
  /** Every amendment offered to this bill, in the publisher's order. Empty in preview mode and on failure. */
  amendments: BillSubResource<BillAmendment>;
};

/**
 * Full bill record page, as an outline of the section panels in `detail/` (one module per collection). Purely
 * presentational: the route resolves every value.
 *
 * Order: cosponsors follow committees (answering the hero's sponsor line), amendments sit under the action history
 * (where a reader first meets one), and related measures come last (the only section pointing off this bill).
 *
 * @param props - {@link BillDetailProps}.
 * @returns The bill record page.
 */
export function BillDetail({
  bill,
  source,
  notice,
  retrievedAt,
  summaries,
  textVersions,
  actions,
  committees,
  cosponsors,
  related,
  amendments,
}: BillDetailProps): JSX.Element {
  // The action history is a better authority than `bill.stage`, read off one line of prose. See resolveBillStage.
  const stage: BillStage = resolveBillStage(bill.stage, actions.entries);
  const counts: LegislativeBill["collectionCounts"] = bill.collectionCounts;

  return (
    <SiteShell>
      <DetailBackLink href="/bills" label="All Bills" />

      <BillHero bill={bill} stage={stage} />

      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />

      <div className="detail-grid">
        <JourneyPanel stage={stage} />
        <LatestActionPanel bill={bill} />
      </div>

      <div className="detail-grid detail-grid--single">
        <CommitteesPanel published={counts?.committees} resource={committees} source={source} />
      </div>

      <div className="detail-grid detail-grid--single">
        <CosponsorsPanel resource={cosponsors} source={source} tally={bill.cosponsorTally} />
      </div>

      <div className="detail-grid">
        <ActionsPanel published={counts?.actions} resource={actions} source={source} />
        <RecordedVotesPanel resource={actions} source={source} />
      </div>

      <div className="detail-grid detail-grid--single">
        <AmendmentsPanel published={counts?.amendments} resource={amendments} source={source} />
      </div>

      <div className="detail-grid">
        <SummariesPanel published={counts?.summaries} resource={summaries} source={source} />
        <TextVersionsPanel published={counts?.textVersions} resource={textVersions} source={source} />
      </div>

      <div className="detail-grid detail-grid--single">
        <RelatedPanel published={counts?.relatedBills} resource={related} source={source} />
      </div>

      <CalloutCard
        body="The summary above is written by the Congressional Research Service, not Civic Ledger — use the linked full text for anything definitive. Update alerts are next, without obscuring the original record."
        heading="A Record Is a Starting Point, Not the Whole Story."
        headingId="reading-heading"
        href="/learn"
        icon={Landmark}
        kicker="Read It With Context"
        linkIcon={ArrowUpRight}
        linkLabel="Learn the Terms"
      />
    </SiteShell>
  );
}
