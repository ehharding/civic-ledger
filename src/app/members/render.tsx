import type { Metadata } from "next";
import type { JSX } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { MemberDirectory } from "@/components/members/member-directory";
import { DataSourceNotice } from "@/components/ui/data-source-notice";
import { getMemberDirectory, type MemberDirectoryResult } from "@/lib/congress/client";
import { refuseDegradedRender } from "@/lib/congress/live-render";
import {
  type JurisdictionOption,
  listMemberJurisdictions,
  type MemberDirectoryQuery,
} from "@/lib/congress/members/filter";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveMemberDirectoryQuery } from "@/lib/search-params";

/** The metadata `/members` and its `/query/members` twin share. Both canonicalize to `/members`. */
export const MEMBERS_METADATA: Metadata = pageMetadata({
  title: "Members",
  description: "Every member currently seated in the House and Senate, searchable by name, state, party, or chamber.",
  path: "/members",
});

/**
 * Renders the member directory, from the same cached roster as the home page's chamber diagram, so the two can't
 * disagree.
 *
 * The URL's filters resolve *after* the roster, since `?state=` is validated against the jurisdictions it contains.
 *
 * Shared by the static `/members` (no query) and the on-demand `/query/members`.
 *
 * @param searchParams - The requested view: `?q=`/`?chamber=`/`?party=`/`?state=`/`?sort=`.
 * @param cachedAs - The cached route this render is stored as. The on-demand twin omits it, since its render is never
 *   cached; see {@link refuseDegradedRender}.
 * @returns The directory page, narrowed to whatever the URL asked for, with all further filtering done in the browser.
 * @see getMemberDirectory
 * @see resolveMemberDirectoryQuery
 * @see src/lib/query-routes.ts
 */
export async function renderMembersRoute(
  searchParams: Promise<RouteSearchParams>,
  cachedAs?: string,
): Promise<JSX.Element> {
  const { members, congress, source, notice, retrievedAt }: MemberDirectoryResult = await getMemberDirectory();
  refuseDegradedRender(source === "preview", cachedAs);

  const initialQuery: MemberDirectoryQuery = await resolveMemberDirectoryQuery(
    searchParams,
    listMemberJurisdictions(members).map((option: JurisdictionOption): string => option.value),
  );

  return (
    <SiteShell>
      <PageHeader
        eyebrow="People"
        title="The People Who Write It."
        description="Search every member of Congress by name, chamber, party, or the place they represent, then open anyone's record to see what they have put their name to."
      />
      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />
      <MemberDirectory congress={congress} initialQuery={initialQuery} members={members} source={source} />
    </SiteShell>
  );
}
