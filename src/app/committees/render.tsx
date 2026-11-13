import type { Metadata } from "next";
import type { JSX } from "react";

import { CommitteeDirectory } from "@/components/committees/committee-directory";
import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { type CommitteeDirectoryResult, getCommitteeDirectory } from "@/lib/congress/client";
import type { CommitteeDirectoryQuery } from "@/lib/congress/committees/filter";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveCommitteeDirectoryQuery } from "@/lib/search-params";

/** The metadata `/committees` and its `/query/committees` twin share. Both canonicalize to `/committees`. */
export const COMMITTEES_METADATA: Metadata = pageMetadata({
  title: "Committees",
  description:
    "Every standing, select, and joint committee of Congress — the bodies most bills are referred to and never leave.",
  path: "/committees",
});

/**
 * Renders the browsable committee directory.
 *
 * The third way into the record, beside `/bills` and `/members`. A bill's most consequential moment is usually its
 * referral to a committee — "Referred to the House Committee on Transportation and Infrastructure" is the latest action
 * on a large share of everything Congress introduces — and this is where that sentence's subject becomes a page.
 *
 * Shared by `/committees`, which passes no query and is therefore static, and `/query/committees`, which passes the
 * request's own and renders on demand. Same trade as `/members`: a shared link arrives already narrowed on its first
 * paint rather than flashing the full list. @see src/lib/query-routes.ts.
 *
 * @param searchParams - The requested view: `?q=`/`?chamber=`/`?type=`/`?sort=`.
 * @returns The directory page, narrowed to whatever the URL asked for, with all further filtering done in the browser.
 */
export async function renderCommitteesRoute(searchParams: Promise<RouteSearchParams>): Promise<JSX.Element> {
  const { committees, congress, source, notice, retrievedAt }: CommitteeDirectoryResult = await getCommitteeDirectory();

  const initialQuery: CommitteeDirectoryQuery = await resolveCommitteeDirectoryQuery(searchParams);

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Committees"
        title="Where Bills Actually Go."
        description="Almost every bill is referred to a committee, and most never leave one. Browse the standing, select, and joint committees of Congress, and see what each has been called over the years."
      />
      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />
      <CommitteeDirectory committees={committees} congress={congress} initialQuery={initialQuery} source={source} />
    </SiteShell>
  );
}
