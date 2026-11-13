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
 * Shared by `/bills`, which passes no query and is therefore static, and `/query/bills`, which passes the request's own
 * and renders on demand. @see src/lib/query-routes.ts.
 *
 * @param searchParams - Carries the shareable `?q=` and `?stage=` deep link. @see resolveBillDirectoryQuery
 * @returns The directory page for the current Congress.
 */
export async function renderBillsRoute(searchParams: Promise<RouteSearchParams>): Promise<JSX.Element> {
  const [initialView, snapshot] = await Promise.all([resolveBillDirectoryQuery(searchParams), getCongressSnapshot()]);

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
