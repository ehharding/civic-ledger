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

type CongressBillsPageProps = {
  params: Promise<{ congress: string }>;
  searchParams: Promise<{ q?: string }>;
};

/**
 * Pre-renders one bill-directory page per Congress the preview fixtures actually cover, mirroring the sibling
 * [type]/[number] route's generateStaticParams. In the default server build this is just a perf win (any other
 * supported Congress still resolves live, on demand); in a static export (STATIC_EXPORT=true, no API key), these are
 * the *only* Congress-scoped directory pages that can exist, since a static export has no server to look anything
 * else up on request.
 */
export function generateStaticParams(): { congress: string }[] {
  const congresses: number[] = Array.from(new Set(previewBills.map((bill: LegislativeBill): number => bill.congress)));
  return congresses.map((congress: number): { congress: string } => ({ congress: String(congress) }));
}

export async function generateMetadata({ params }: CongressBillsPageProps): Promise<Metadata> {
  const { congress: rawCongress } = await params;
  const congress: number | null = parseCongressParam(rawCongress);

  return { title: congress === null ? "Bills" : `${formatOrdinal(congress)} Congress Bills` };
}

/**
 * Bill directory for one specific Congress, reached from the Congress switcher on /bills or by a direct link (e.g.,
 * /bills/118). Renders the 404 page for anything outside the range this app supports — see parseCongressParam.
 * The current Congress works here too (it's not redirected to /bills), so every Congress the switcher lists resolves to
 * a real page under this one route.
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
