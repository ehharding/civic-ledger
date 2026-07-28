import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillDirectory } from "@/components/bill-directory";
import { CongressSwitcher } from "@/components/congress-switcher";
import { DataSourceNotice } from "@/components/data-source-notice";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { getCongressSnapshotForCongress } from "@/lib/congress/client";
import { getCongressYearRange, listCongresses, parseCongressParam } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { previewBills } from "@/lib/congress/fixtures";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";
import { resolveInitialQuery } from "@/lib/search-params";

/** Params for the per-Congress bill directory route (`/bills/[congress]`), plus its shareable `?q=` deep link. */
type CongressBillsPageProps = {
  params: Promise<{ congress: string }>;
  searchParams: Promise<{ q?: string }>;
};

/**
 * Pre-renders one bill-directory page per Congress the preview fixtures actually cover.
 *
 * In the default server build this is only a performance win — any other supported Congress still resolves live, on
 * demand. In a static export (`STATIC_EXPORT=true`, no API key) these are the *only* Congress-scoped directory pages
 * that can exist, since there's no server left to look anything else up at request time.
 *
 * @returns One params object per Congress covered by the fixtures, de-duplicated.
 */
export function generateStaticParams(): { congress: string }[] {
  const congresses: number[] = Array.from(new Set(previewBills.map((bill: LegislativeBill): number => bill.congress)));
  return congresses.map((congress: number): { congress: string } => ({ congress: String(congress) }));
}

/**
 * Builds the per-Congress page title.
 *
 * @param params - The route's `congress` param.
 * @returns e.g., `"118th Congress Bills"`, or the generic `"Bills"` for an out-of-range Congress — the page itself
 *   renders a 404 in that case, so the metadata simply avoids implying a page that isn't there.
 */
export async function generateMetadata({ params }: CongressBillsPageProps): Promise<Metadata> {
  const { congress: rawCongress } = await params;
  const congress: number | null = parseCongressParam(rawCongress);

  return { title: congress === null ? "Bills" : `${formatOrdinal(congress)} Congress Bills` };
}

/**
 * Bill directory for one specific Congress, reached from the switcher on `/bills` or by direct link
 * (e.g., `/bills/118`).
 *
 * The current Congress resolves here too rather than redirecting to `/bills`, so every Congress the switcher lists
 * behaves identically and no entry is a special case.
 *
 * @param params - The route's `congress` param. Anything outside the supported range renders the 404 page.
 *   @see parseCongressParam
 * @param searchParams - Carries the shareable `?q=` deep link.
 * @returns The directory page for that Congress.
 */
export default async function CongressBillsPage({
  params,
  searchParams,
}: CongressBillsPageProps): Promise<JSX.Element> {
  const [{ congress: rawCongress }, initialQuery]: [{ congress: string }, string] = await Promise.all([
    params,
    resolveInitialQuery(searchParams),
  ]);
  const congress: number | null = parseCongressParam(rawCongress);
  if (congress === null) notFound();

  const snapshot: CongressSnapshot = await getCongressSnapshotForCongress(congress);
  const { startYear, endYear } = getCongressYearRange(congress);
  const isCurrent: boolean = congress === getCurrentCongress();

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Legislation"
        title={`The ${formatOrdinal(congress)} Congress.`}
        description={`Search the ${isCurrent ? "current" : formatOrdinal(congress)} Congress's bills (${startYear}–${endYear}), then follow each record back to its official Congress.gov source.`}
      />
      <CongressSwitcher congresses={listCongresses()} selected={congress} />
      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} retrievedAt={snapshot.retrievedAt} />
      <BillDirectory
        bills={snapshot.bills}
        canLoadMore={snapshot.source === "live"}
        congress={congress}
        initialQuery={initialQuery}
      />
    </SiteShell>
  );
}
