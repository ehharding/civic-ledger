import type { Metadata } from "next";
import type { JSX } from "react";

import { CommitteeDirectory } from "@/components/committee-directory";
import { DataSourceNotice } from "@/components/data-source-notice";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { type CommitteeDirectoryResult, getCommitteeDirectory } from "@/lib/congress/client";
import type { CommitteeDirectoryQuery } from "@/lib/congress/committee-filter";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveCommitteeDirectoryQuery } from "@/lib/search-params";

/**
 * The route segment's data-cache window. Reading `searchParams` makes this render on demand rather than at build time,
 * which costs a server render per visit and *not* an upstream request: the committee list is fetched through the
 * adapter's own five-minute cache, shared across every visitor and every narrowing of this page. Same trade as
 * `/members`: a shared link should arrive already narrowed on its first paint rather than flashing the full list.
 * @see docs/architecture.md, "A Narrowed Directory Is a Place, So It Has a URL".
 */
export const revalidate: number = 300;

export const metadata: Metadata = pageMetadata({
  title: "Committees",
  description:
    "Every standing, select, and joint committee of Congress — the bodies most bills are referred to and never leave.",
  path: "/committees",
});

/** Params for the committee directory route — the shareable `?q=`/`?chamber=`/`?type=`/`?sort=` view. */
type CommitteesPageProps = {
  searchParams: Promise<RouteSearchParams>;
};

/**
 * Browsable committee directory route.
 *
 * The third way into the record, beside `/bills` and `/members`. A bill's most consequential moment is usually its
 * referral to a committee — "Referred to the House Committee on Transportation and Infrastructure" is the latest
 * action on a large share of everything Congress introduces — and until now that sentence named a body this app could
 * say nothing about. This is that body.
 *
 * @param searchParams - The requested view. @see CommitteesPageProps
 * @returns The directory page, narrowed to whatever the URL asked for, with all further filtering done in the browser.
 */
export default async function CommitteesPage({ searchParams }: CommitteesPageProps): Promise<JSX.Element> {
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
