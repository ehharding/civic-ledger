import type { Metadata } from "next";
import type { JSX } from "react";

import { CURRENT_CONGRESS_BILLS_HEADER } from "@/app/bills/header-copy";
import { BillDirectory } from "@/components/bills/bill-directory";
import { CongressSwitcher } from "@/components/bills/congress-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { getCongressSnapshot } from "@/lib/congress/client";
import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { refuseDegradedRender } from "@/lib/congress/live-render";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveBillDirectoryQuery } from "@/lib/search-params";

/** The metadata `/bills` and its `/query/bills` twin share. Both canonicalize to `/bills`. */
export const BILLS_METADATA: Metadata = pageMetadata({
  title: "Bills",
  description: "Browse and search bills and resolutions before Congress, by topic, citation, or legislative stage.",
  path: "/bills",
});

/**
 * Renders the bill directory for the *current* Congress.
 *
 * Any other Congress lives at `/bills/[congress]`, reachable from the switcher rendered here. The two fetches — the
 * deep-link query and the snapshot — are awaited together, since neither depends on the other.
 *
 * Shared by the static `/bills` (no query) and the on-demand `/query/bills`.
 *
 * @param searchParams - Carries the shareable `?q=` and `?stage=` deep link.
 * @param cachedAs - The cached route this render is stored as, omitted by the uncached `/query` twin. See
 *   {@link refuseDegradedRender}.
 * @returns The directory page for the current Congress.
 * @see getCongressSnapshot
 * @see resolveBillDirectoryQuery
 * @see src/lib/query-routes.ts
 */
export async function renderBillsRoute(
  searchParams: Promise<RouteSearchParams>,
  cachedAs?: string,
): Promise<JSX.Element> {
  const [initialView, snapshot] = await Promise.all([resolveBillDirectoryQuery(searchParams), getCongressSnapshot()]);
  refuseDegradedRender(snapshot.source === "preview", cachedAs);

  return (
    <SiteShell>
      <PageHeader {...CURRENT_CONGRESS_BILLS_HEADER} />
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
