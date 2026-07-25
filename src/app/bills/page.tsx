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
import { resolveInitialQuery } from "@/lib/search-params";

export const metadata: Metadata = { title: "Bills" };

/**
 * Bill directory route for the *current* Congress. Fetches the current snapshot server-side, then hands off to the
 * interactive BillDirectory. Any other Congress lives at /bills/[congress] instead — reachable from the Congress
 * switcher rendered here.
 */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<JSX.Element> {
  const [initialQuery, snapshot] = await Promise.all([resolveInitialQuery(searchParams), getCongressSnapshot()]);

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Legislation"
        title="Start With the Record."
        description="Search the current Congress's bills, then follow each record back to its official Congress.gov source."
      />
      <CongressSwitcher congresses={listCongresses()} selected={getCurrentCongress()} />
      <DataSourceNotice source={snapshot.source} notice={snapshot.notice} retrievedAt={snapshot.retrievedAt} />
      <BillDirectory bills={snapshot.bills} canLoadMore={snapshot.source === "live"} initialQuery={initialQuery} />
    </SiteShell>
  );
}
