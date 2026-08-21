import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillDetail } from "@/components/bills/bill-detail";
import {
  type BillAction,
  type BillAmendment,
  type BillCosponsor,
  type BillRouteParams,
  type BillSummary,
  type BillTextVersion,
  type LegislativeBill,
  NO_LATEST_ACTION_TEXT,
  type RelatedBill,
} from "@/lib/congress/bills/model";
import {
  type BillLookupResult,
  type BillSubResource,
  getBillActions,
  getBillAmendments,
  getBillById,
  getBillCommittees,
  getBillCosponsors,
  getBillSummaries,
  getBillTextVersions,
  getRelatedBills,
} from "@/lib/congress/client";
import type { BillCommittee } from "@/lib/congress/committees/model";
import { previewBills } from "@/lib/congress/upstream/fixtures";
import { formatOrdinal } from "@/lib/format";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { billHref } from "@/lib/routes";

/** Params for the individual bill record route (`/bills/[congress]/[type]/[number]`). */
type BillPageProps = {
  params: Promise<BillRouteParams>;
};

/**
 * Pre-renders the preview bills at build time.
 *
 * In the default server build this is only a performance win — every other bill still resolves live, on demand. In a
 * static export these are the *only* bill pages that can exist, since there's no server left at request time.
 *
 * @returns One params object per preview fixture.
 */
export function generateStaticParams(): BillRouteParams[] {
  return previewBills.map(
    (bill: LegislativeBill): BillRouteParams => ({
      congress: String(bill.congress),
      type: bill.type.toLowerCase(),
      number: bill.number,
    }),
  );
}

/**
 * Builds the per-bill title and description, so a bill page reads as itself in a browser tab, a share card, or a search
 * result rather than falling back to the site-wide default.
 *
 * Calls `getBillById` a second time without a second upstream request: Next memoizes `fetch` per request, so this and
 * the page component below share one response for the same route.
 *
 * @param params - The bill's route params.
 * @returns The bill's metadata, or a "Bill Not Found" title when it doesn't resolve.
 */
export async function generateMetadata({ params }: BillPageProps): Promise<Metadata> {
  const route: BillRouteParams = await params;
  const { bill }: BillLookupResult = await getBillById(route);

  if (!bill) return notFoundMetadata("Bill Not Found");

  // The latest action is the most useful single sentence about a bill — it says where the bill actually *is*, which is
  // the question someone following a shared link is most often asking. A freshly introduced record can carry no action
  // prose at all, and naming the bill is a better link preview than the placeholder that stands in for it elsewhere.
  //
  // A comparison rather than a nullish check, because `latestAction.text` is a required string on the model: the
  // absence is spelled as that placeholder, not as a missing field, so a `??` here would type-check and never fire.
  // @see NO_LATEST_ACTION_TEXT.
  const hasActionText: boolean = bill.latestAction.text !== NO_LATEST_ACTION_TEXT;

  return pageMetadata({
    title: `${bill.type} ${bill.number}: ${bill.title}`,
    description: hasActionText
      ? bill.latestAction.text
      : `${bill.type} ${bill.number} in the ${formatOrdinal(bill.congress)} Congress.`,
    path: billHref(bill),
  });
}

/**
 * Individual bill record route.
 *
 * Resolves the bill by direct lookup rather than by filtering the homepage snapshot, so any real bill number
 * works — not just the dozen the list endpoint most recently returned. The bill, its CRS summaries, its official text
 * versions, its action history, its committee referrals, its cosponsors, the amendments offered to it, and the measures
 * it is related to are independent reads, so all eight go out together rather than in sequence.
 *
 * Independent in their failures, too, which is why the seven collections arrive as {@link BillSubResource}s rather than
 * as bare arrays: the bill itself can resolve from the cached list snapshot while a sub-resource request fails, and in
 * that state the bill carries no `collectionCounts` to check an empty list against. Each collection therefore says for
 * itself whether it was answered. @see EmptySectionNote for what the page does with that.
 *
 * @param params - The bill's route params, straight from the URL.
 * @returns The bill record page, or the 404 page when the lookup resolves to nothing.
 */
export default async function BillPage({ params }: BillPageProps): Promise<JSX.Element> {
  const route: BillRouteParams = await params;
  const [
    { bill, source, notice, retrievedAt },
    summaries,
    textVersions,
    actions,
    committees,
    cosponsors,
    related,
    amendments,
  ]: [
    BillLookupResult,
    BillSubResource<BillSummary>,
    BillSubResource<BillTextVersion>,
    BillSubResource<BillAction>,
    BillSubResource<BillCommittee>,
    BillSubResource<BillCosponsor>,
    BillSubResource<RelatedBill>,
    BillSubResource<BillAmendment>,
  ] = await Promise.all([
    getBillById(route),
    getBillSummaries(route),
    getBillTextVersions(route),
    getBillActions(route),
    getBillCommittees(route),
    getBillCosponsors(route),
    getRelatedBills(route),
    getBillAmendments(route),
  ]);

  if (!bill) notFound();

  return (
    <BillDetail
      bill={bill}
      source={source}
      notice={notice}
      retrievedAt={retrievedAt}
      summaries={summaries}
      textVersions={textVersions}
      actions={actions}
      committees={committees}
      cosponsors={cosponsors}
      related={related}
      amendments={amendments}
    />
  );
}
