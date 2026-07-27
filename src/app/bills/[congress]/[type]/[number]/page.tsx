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
 * Pre-renders the preview bills at build time. In the default server build this is just a perf win (other bills
 * still resolve live, on demand). In a static export (STATIC_EXPORT=true, no API key), these are the *only* bill pages
 * that can exist, since a static export has no server to look anything else up on request.
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
 * Per-bill `<title>`/description, so a bill page reads as itself (in a browser tab, a share card, a search result)
 * instead of falling back to the site-wide default. Reuses `getBillById` — Next's request-level fetch memoization means
 * this doesn't cost a second live request alongside the page component's own call for the same route.
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
 * Individual bill record route. Resolves the bill via a direct lookup (`getBillById`) rather than filtering the
 * homepage snapshot, so any real bill number works — not just the dozen most recently returned by the list endpoint.
 * Renders the 404 page (via `notFound()`) when the lookup comes back empty. Fetches the bill alongside its CRS
 * summaries and official text versions in parallel, then hands everything to BillDetail for rendering.
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
