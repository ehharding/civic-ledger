import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillDetail } from "@/components/bill-detail";
import { type BillLookupResult, getBillById, getBillSummaries, getBillTextVersions } from "@/lib/congress/client";
import { previewBills } from "@/lib/congress/fixtures";
import type { BillRouteParams, BillSummary, BillTextVersion, LegislativeBill } from "@/lib/congress/types";

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

  if (!bill) return { title: "Bill Not Found" };

  return {
    title: `${bill.type} ${bill.number}: ${bill.title}`,
    description: bill.latestAction.text,
  };
}

/**
 * Individual bill record route.
 *
 * Resolves the bill by direct lookup rather than by filtering the homepage snapshot, so any real bill number works —
 * not just the dozen the list endpoint most recently returned. The bill, its CRS summaries, and its official text
 * versions are independent reads, so all three go out together.
 *
 * @param params - The bill's route params, straight from the URL.
 * @returns The bill record page, or the 404 page when the lookup resolves to nothing.
 */
export default async function BillPage({ params }: BillPageProps): Promise<JSX.Element> {
  const route: BillRouteParams = await params;
  const [{ bill, source, notice, retrievedAt }, summaries, textVersions]: [
    BillLookupResult,
    BillSummary[],
    BillTextVersion[],
  ] = await Promise.all([getBillById(route), getBillSummaries(route), getBillTextVersions(route)]);

  if (!bill) notFound();

  return (
    <BillDetail
      bill={bill}
      source={source}
      notice={notice}
      retrievedAt={retrievedAt}
      summaries={summaries}
      textVersions={textVersions}
    />
  );
}
