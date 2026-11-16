import type { Metadata } from "next";
import type { JSX } from "react";

import { CommitteeDirectory } from "@/components/committees/committee-directory";
import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { type CommitteeDirectoryResult, getCommitteeDirectory } from "@/lib/congress/client";
import type { CommitteeDirectoryQuery } from "@/lib/congress/committees/filter";
import { refuseDegradedRender } from "@/lib/congress/live-render";
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
 * Renders the browsable committee directory — where the subject of "Referred to the House Committee on…", the latest
 * action on much of what Congress introduces, becomes a page.
 *
 * Shared by the static `/committees` (no query) and the on-demand `/query/committees`, so a shared link arrives already
 * narrowed on first paint.
 *
 * @param searchParams - The requested view: `?q=`/`?chamber=`/`?type=`/`?sort=`.
 * @param cachedAs - The cached route this render is stored as, omitted by the uncached `/query` twin. See
 *   {@link refuseDegradedRender}.
 * @returns The directory page, narrowed to whatever the URL asked for, with all further filtering done in the browser.
 * @see src/lib/query-routes.ts
 */
export async function renderCommitteesRoute(
  searchParams: Promise<RouteSearchParams>,
  cachedAs?: string,
): Promise<JSX.Element> {
  const { committees, congress, source, notice, retrievedAt }: CommitteeDirectoryResult = await getCommitteeDirectory();
  refuseDegradedRender(source === "preview", cachedAs);

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
