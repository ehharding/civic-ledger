import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillDetail } from "@/components/bill-detail";
import { billHref } from "@/lib/bill-route";
import {
  type BillLookupResult,
  getBillActions,
  getBillById,
  getBillSummaries,
  getBillTextVersions,
} from "@/lib/congress/client";
import { previewBills } from "@/lib/congress/fixtures";
import type { BillAction, BillRouteParams, BillSummary, BillTextVersion, LegislativeBill } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";

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

  return pageMetadata({
    title: `${bill.type} ${bill.number}: ${bill.title}`,
    // The latest action is the most useful single sentence about a bill — it says where the bill actually *is*, which
    // is the question someone following a shared link is most often asking. Falls back to naming the bill, since a
    // freshly introduced record can carry no action text at all.
    /* v8 ignore start -- `latestAction.text` is a required string on the model; the fallback is belt-and-braces. */
    description:
      bill.latestAction.text ?? `${bill.type} ${bill.number} in the ${formatOrdinal(bill.congress)} Congress.`,
    /* v8 ignore stop */
    path: billHref(bill),
  });
}

/**
 * Individual bill record route.
 *
 * Resolves the bill by direct lookup rather than by filtering the homepage snapshot, so any real bill number
 * works — not just the dozen the list endpoint most recently returned. The bill, its CRS summaries, its official text
 * versions, and its action history are independent reads, so all four go out together.
 *
 * @param params - The bill's route params, straight from the URL.
 * @returns The bill record page, or the 404 page when the lookup resolves to nothing.
 */
export default async function BillPage({ params }: BillPageProps): Promise<JSX.Element> {
  const route: BillRouteParams = await params;
  const [{ bill, source, notice, retrievedAt }, summaries, textVersions, actions]: [
    BillLookupResult,
    BillSummary[],
    BillTextVersion[],
    BillAction[],
  ] = await Promise.all([
    getBillById(route),
    getBillSummaries(route),
    getBillTextVersions(route),
    getBillActions(route),
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
    />
  );
}
