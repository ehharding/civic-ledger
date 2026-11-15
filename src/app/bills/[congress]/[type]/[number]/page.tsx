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

/**
 * The *longest* a bill page is cached: one day. Its fetches shorten that to five minutes for the current Congress; the
 * ceiling bounds a page whose fetches all failed.
 *
 * @see revalidateSecondsForCongress
 */
export const revalidate: number = 86_400;

/** Params for the individual bill record route (`/bills/[congress]/[type]/[number]`). */
type BillPageProps = {
  params: Promise<BillRouteParams>;
};

/**
 * Pre-renders the preview bills — a performance win on a server build, and the only bill pages a static export has.
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
 * Builds the per-bill title and description. Shares the page's read: `getBillById` is memoized per render.
 *
 * @param params - The bill's route params.
 * @returns The bill's metadata, or a "Bill Not Found" title when it doesn't resolve.
 */
export async function generateMetadata({ params }: BillPageProps): Promise<Metadata> {
  const route: BillRouteParams = await params;
  const { bill }: BillLookupResult = await getBillById(route);

  if (!bill) return notFoundMetadata("Bill Not Found");

  // The latest action says where the bill *is*; with none recorded, naming the bill beats the placeholder. Compared
  // rather than `??`'d, since absence is spelled as `NO_LATEST_ACTION_TEXT`, not a missing field.
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
 * Individual bill record route. Looks the bill up directly (so any real bill number works) and fetches its seven
 * collections in parallel. Each arrives as a {@link BillSubResource} saying whether it was answered, since they can
 * fail independently of the bill.
 *
 * @param params - The bill's route params, straight from the URL.
 * @returns The bill record page, or the 404 page when the lookup resolves to nothing.
 * @see EmptySectionNote
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
