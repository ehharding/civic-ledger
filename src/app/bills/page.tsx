import type { Metadata } from "next";
import type { JSX } from "react";

import { BillDirectory } from "@/components/bill-directory";
import { CongressSwitcher } from "@/components/congress-switcher";
import { DataSourceNotice } from "@/components/data-source-notice";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { getCongressSnapshot } from "@/lib/congress/client";
import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveBillDirectoryQuery } from "@/lib/search-params";

/**
 * The route segment's data-cache window, declared as on `/members` and `/committees` so all three directories state the
 * same thing about themselves. Reading `searchParams` makes this render on demand, which costs a server render per
 * visit and *not* an upstream request: the snapshot is fetched through the adapter's own five-minute cache
 * (`REVALIDATE_SECONDS` in `http.ts`), shared across every visitor and every narrowing of this page.
 */
export const revalidate: number = 300;

export const metadata: Metadata = pageMetadata({
  title: "Bills",
  description: "Browse and search bills and resolutions before Congress, by topic, citation, or legislative stage.",
  path: "/bills",
});

/**
 * Bill directory route for the *current* Congress.
 *
 * Any other Congress lives at `/bills/[congress]`, reachable from the switcher rendered here. The two fetches — the
 * deep-link query and the snapshot — are awaited together, since neither depends on the other.
 *
 * @param searchParams - Carries the shareable `?q=` and `?stage=` deep link.
 *   @see resolveBillDirectoryQuery
 * @returns The directory page for the current Congress.
 */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}): Promise<JSX.Element> {
  const [initialView, snapshot] = await Promise.all([resolveBillDirectoryQuery(searchParams), getCongressSnapshot()]);

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Legislation"
        title="Start With the Record."
        description="Search the current Congress's bills, then follow each record back to its official Congress.gov source."
      />
      <CongressSwitcher congresses={listCongresses()} selected={getCurrentCongress()} />
      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} retrievedAt={snapshot.retrievedAt} />
      <BillDirectory
        bills={snapshot.bills}
        canLoadMore={snapshot.source === "live"}
        initialQuery={initialView.query}
        initialStage={initialView.stage}
      />
    </SiteShell>
  );
}
