import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { BillDirectory } from "@/components/bills/bill-directory";
import { CongressSwitcher } from "@/components/bills/congress-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import type { CongressSnapshot } from "@/lib/congress/bills/model";
import { getCongressSnapshotForCongress } from "@/lib/congress/client";
import { getCongressYearRange, listCongresses, parseCongressParam } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { formatOrdinal } from "@/lib/format";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveBillDirectoryQuery } from "@/lib/search-params";

/** The route params `/bills/[congress]` and its `/query/bills/[congress]` twin share. */
export type CongressBillsParams = Promise<{ congress: string }>;

/**
 * Builds the per-Congress page title, description, and share tags, for both halves of the route.
 *
 * @param params - The route's `congress` param.
 * @returns e.g., `"118th Congress Bills"`, naming the calendar years that Congress sat so a shared link says *when* as
 *   well as which. An out-of-range Congress gets the `noindex` not-found metadata instead — the page itself renders a
 *   404 in that case, and the tags should agree rather than implying a page that isn't there.
 */
export async function congressBillsMetadata(params: CongressBillsParams): Promise<Metadata> {
  const { congress: rawCongress } = await params;
  const congress: number | null = parseCongressParam(rawCongress);

  if (congress === null) return notFoundMetadata("Congress Not Found");

  const { startYear, endYear } = getCongressYearRange(congress);
  const ordinal: string = formatOrdinal(congress);

  return pageMetadata({
    title: `${ordinal} Congress Bills`,
    description: `Bills and resolutions introduced in the ${ordinal} Congress (${startYear}–${endYear}).`,
    path: `/bills/${congress}`,
  });
}

/**
 * Renders the bill directory for one specific Congress, reached from the switcher on `/bills` or by direct link (e.g.,
 * `/bills/118`).
 *
 * The current Congress resolves here too rather than redirecting to `/bills`, so every Congress the switcher lists
 * behaves identically and no entry is a special case.
 *
 * Shared by `/bills/[congress]`, which passes no query and is therefore static, and `/query/bills/[congress]`, which
 * passes the request's own and renders on demand.
 *
 * @param params - The route's `congress` param. Anything outside the supported range renders the 404 page.
 * @param searchParams - Carries the shareable `?q=` and `?stage=` deep link.
 * @returns The directory page for that Congress.
 * @see src/lib/query-routes.ts
 * @see parseCongressParam
 * @see resolveBillDirectoryQuery
 */
export async function renderCongressBillsRoute(
  params: CongressBillsParams,
  searchParams: Promise<RouteSearchParams>,
): Promise<JSX.Element> {
  const [{ congress: rawCongress }, initialView] = await Promise.all([params, resolveBillDirectoryQuery(searchParams)]);
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
        initialQuery={initialView.query}
        initialStage={initialView.stage}
      />
    </SiteShell>
  );
}
