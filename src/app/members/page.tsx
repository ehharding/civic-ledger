import type { Metadata } from "next";
import type { JSX } from "react";

import { DataSourceNotice } from "@/components/data-source-notice";
import { MemberDirectory } from "@/components/member-directory";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { getMemberDirectory, type MemberDirectoryResult } from "@/lib/congress/client";
import {
  type JurisdictionOption,
  listMemberJurisdictions,
  type MemberDirectoryQuery,
} from "@/lib/congress/member-filter";
import { pageMetadata } from "@/lib/metadata";
import { type RouteSearchParams, resolveMemberDirectoryQuery } from "@/lib/search-params";

/**
 * Kept as the route segment's data-cache window, though reading `searchParams` now makes this route render on demand
 * rather than being prerendered as it was. That costs a server render per visit and *not* an upstream request: the
 * roster is fetched through the adapter's own five-minute cache (`REVALIDATE_SECONDS` in `http.ts`), which is shared
 * across every visitor and every narrowing of this page. The trade was deliberate — see "A Narrowed Directory Is a
 * Place, So It Has a URL" in `docs/decisions.md`.
 */
export const revalidate: number = 300;

export const metadata: Metadata = pageMetadata({
  title: "Members",
  description: "Every member currently seated in the House and Senate, searchable by name, state, party, or chamber.",
  path: "/members",
});

/** Params for the member directory route — the shareable `?q=`/`?chamber=`/`?party=`/`?state=`/`?sort=` view. */
type MembersPageProps = {
  searchParams: Promise<RouteSearchParams>;
};

/**
 * Browsable member directory route.
 *
 * The counterpart to `/bills`: that route is the way into the record, this is the way into the people who make it.
 * Every card links to `/members/[bioguideId]`, the page that already existed but could previously only be reached by
 * finding a seat in the chamber diagram or a bill the member happened to sponsor.
 *
 * Reads the same roster the home page's chamber diagram does, through the same cached call, so browsing here costs
 * nothing extra upstream within the five-minute window and the two views can't disagree about who is serving.
 * @see getMemberDirectory
 *
 * The URL's filters are resolved *after* the roster rather than alongside it, which is the one place this route reads
 * sequentially on purpose: `?state=` is validated against the jurisdictions the roster actually contains, so a link to
 * a state nobody currently represents opens the full directory instead of an empty grid claiming to be filtered.
 * @see resolveMemberDirectoryQuery
 *
 * @param searchParams - The requested view. @see MembersPageProps
 * @returns The directory page, narrowed to whatever the URL asked for, with all further filtering done in the browser.
 */
export default async function MembersPage({ searchParams }: MembersPageProps): Promise<JSX.Element> {
  const { members, congress, source, notice, retrievedAt }: MemberDirectoryResult = await getMemberDirectory();

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
