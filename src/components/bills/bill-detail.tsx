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
  BillSummary,
  BillTextVersion,
  CongressSnapshot,
  LegislativeBill,
  RelatedBill,
} from "@/lib/congress/bills/model";
import { resolveBillStage } from "@/lib/congress/bills/stage";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";
import type { BillCommittee } from "@/lib/congress/committees/model";

/**
 * The bill record page, as an outline of the sections it is made of.
 *
 * Each of those sections lives in `detail/` beside this file — one module per collection Congress.gov hangs off a
 * bill, each holding that collection's panel, its list, and the row inside it. The split is by *subject* rather than by
 * kind (all the rows in one file, all the panels in another) because a subject is what someone actually arrives here to
 * change: an edit to how a cosponsor reads touches the row, the list's counting sentence, and the panel's empty-state
 * copy, and those are one thought rather than three files' worth.
 *
 * What stays here is the part that is genuinely about the page rather than about any one section: which sections exist,
 * what order they read in, and which of them share a row. @see BillDetail, whose doc comment is where that order is
 * argued for.
 */

/** Props for {@link BillDetail} — everything the bill detail route resolves server-side. */
type BillDetailProps = {
  bill: LegislativeBill;
  /** Whether this record is live Congress.gov data or a labeled preview fixture. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* preview data is being shown, when it is. */
  notice?: string;
  /** When this bill's data was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  // The seven collections fetched alongside the bill, each carrying whether its own request was answered.
  //
  // They arrive as `BillSubResource`s rather than as bare arrays because every one of these sections prints a sentence
  // when its list is empty, and six of those sentences are assertions about the congressional record — "no member has
  // cosponsored this bill", "Congress.gov records no measure as related to this one". A list of length zero is not
  // enough to license any of them, and it is all a bare array can say.
  //
  // A line comment rather than a doc comment on purpose: it describes the seven fields below as a group, and a
  // `/** */` here would attach to `summaries` alone — where the field's own doc comment immediately replaces it, so the
  // paragraph would reach no reader hovering any of the seven.
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
   * @see previewCosponsors
   */
  cosponsors: BillSubResource<BillCosponsor>;
  /** Every measure recorded as related to this one, in the publisher's order. Empty in preview mode and on failure. */
  related: BillSubResource<RelatedBill>;
  /** Every amendment offered to this bill, in the publisher's order. Empty in preview mode and on failure. */
  amendments: BillSubResource<BillAmendment>;
};

/**
 * Full bill record page.
 *
 * Purely presentational: every value is resolved by the route (`page.tsx`) and passed in, so this component has no
 * fetching, no environment access, and nothing that behaves differently between a live and a preview render except the
 * wording it chooses.
 *
 * The body is deliberately an *outline* rather than the page's markup: each record section is one of the panel
 * components above, so what stays here is the order the sections read in and which of them share a row. That order is
 * the part worth being able to see at a glance — the cosponsors sit between the committees that held the bill and the
 * actions taken on it because they answer the question the hero's sponsor line opens and cannot close; the amendments
 * sit directly under the action history because that is where a reader first meets one, as a sentence naming a number;
 * and the related measures come last because they are the only section that points off this bill entirely.
 *
 * @param props - @see BillDetailProps
 * @returns The hero (identity, stage, sponsor and cosponsor meta), the `BillJourney` stepper, the latest action with a
 *   link to the official record, the CRS summaries, every official text version, and the closing context card.
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
  // The action history is the better authority on where a bill has got to: `bill.stage` was read off one line of prose,
  // and the latest action of a bill that has passed one chamber usually describes a referral in the other.
  // @see resolveBillStage.
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
