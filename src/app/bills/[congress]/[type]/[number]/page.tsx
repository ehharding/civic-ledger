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
import { refuseDegradedRender } from "@/lib/congress/live-render";
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

/** This route's pattern, as a refused render names it. */
const BILL_ROUTE: string = "/bills/[congress]/[type]/[number]";

/** Params for the individual bill record route (`/bills/[congress]/[type]/[number]`). */
type BillPageProps = {
  /** The dynamic segments, as Next hands them over. */
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
 * @param props - {@link BillPageProps}.
 * @returns The bill's metadata, or a "Bill Not Found" title when it doesn't resolve.
 */
export async function generateMetadata({ params }: BillPageProps): Promise<Metadata> {
  const route: BillRouteParams = await params;
  const { bill, unavailable }: BillLookupResult = await getBillById(route);

  // Before the 404 title: a lookup that failed would otherwise title a real bill's error page "Bill Not Found".
  refuseDegradedRender(unavailable, BILL_ROUTE);
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
 * An answered, empty collection, standing in for a request the bill's own record says would find nothing.
 *
 * @typeParam Entry - The collection's entry type.
 * @returns An empty collection marked answered.
 */
function noneOnRecord<Entry>(): Promise<BillSubResource<Entry>> {
  return Promise.resolve({ entries: [], unavailable: false });
}

/**
 * Requests one collection unless the bill's live record publishes its size as zero. Only an explicit zero skips:
 * whether Congress.gov omits an empty collection's count or publishes `0` is unconfirmed, and skipping on absence would
 * state "none on record" about a collection nobody asked for.
 *
 * @typeParam Entry - The collection's entry type.
 * @param published - The bill's published count for this collection, if any.
 * @param read - The collection's read.
 * @returns The read's result, or {@link noneOnRecord}.
 */
function unlessPublishedEmpty<Entry>(
  published: number | undefined,
  read: () => Promise<BillSubResource<Entry>>,
): Promise<BillSubResource<Entry>> {
  return published === 0 ? noneOnRecord() : read();
}

/**
 * Individual bill record route. Looks the bill up directly (so any real bill number works), then fetches its seven
 * collections in parallel. Each arrives as a {@link BillSubResource} saying whether it was answered, since they can
 * fail independently of the bill.
 *
 * The lookup goes first, alone, for two reasons that both spend less of the shared Congress.gov quota: a failed lookup
 * refuses the render after one request instead of nine, and a collection the record publishes as empty isn't requested.
 * A render with any unanswered read is refused rather than cached for the day. See refuseDegradedRender.
 *
 * @param props - {@link BillPageProps}.
 * @returns The bill record page, or the 404 page when the lookup resolves to nothing.
 * @see EmptySectionNote
 */
export default async function BillPage({ params }: BillPageProps): Promise<JSX.Element> {
  const route: BillRouteParams = await params;
  const { bill, source, notice, retrievedAt, unavailable }: BillLookupResult = await getBillById(route);

  refuseDegradedRender(unavailable, BILL_ROUTE);
  if (!bill) notFound();

  // Preview fixtures publish counts that describe the fixture, not what the preview reads return, so only a live
  // record's counts gate anything.
  const counts: LegislativeBill["collectionCounts"] = source === "live" ? bill.collectionCounts : undefined;
  const cosponsorCount: number | undefined =
    source === "live" ? (bill.cosponsorTally?.includingWithdrawn ?? bill.cosponsorTally?.current) : undefined;

  const [summaries, textVersions, actions, committees, cosponsors, related, amendments]: [
    BillSubResource<BillSummary>,
    BillSubResource<BillTextVersion>,
    BillSubResource<BillAction>,
    BillSubResource<BillCommittee>,
    BillSubResource<BillCosponsor>,
    BillSubResource<RelatedBill>,
    BillSubResource<BillAmendment>,
  ] = await Promise.all([
    unlessPublishedEmpty(counts?.summaries, () => getBillSummaries(route)),
    unlessPublishedEmpty(counts?.textVersions, () => getBillTextVersions(route)),
    unlessPublishedEmpty(counts?.actions, () => getBillActions(route)),
    unlessPublishedEmpty(counts?.committees, () => getBillCommittees(route)),
    unlessPublishedEmpty(cosponsorCount, () => getBillCosponsors(route)),
    unlessPublishedEmpty(counts?.relatedBills, () => getRelatedBills(route)),
    unlessPublishedEmpty(counts?.amendments, () => getBillAmendments(route)),
  ]);

  refuseDegradedRender(
    [summaries, textVersions, actions, committees, cosponsors, related, amendments].some(
      (collection: { unavailable: boolean }): boolean => collection.unavailable,
    ),
    BILL_ROUTE,
  );

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
