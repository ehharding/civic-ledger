import type { Metadata } from "next";
import type { JSX } from "react";

import { DataSourceNotice } from "@/components/data-source-notice";
import { MemberDirectory } from "@/components/member-directory";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { getMemberDirectory, type MemberDirectoryResult } from "@/lib/congress/client";

export const revalidate: number = 300;

export const metadata: Metadata = { title: "Members" };

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
 * @returns The directory page, with the whole roster resolved server-side and filtered in the browser.
 */
export default async function MembersPage(): Promise<JSX.Element> {
  const { members, congress, source, notice, retrievedAt }: MemberDirectoryResult = await getMemberDirectory();

  return (
    <SiteShell>
      <PageHeader
        eyebrow="People"
        title="The People Who Write It."
        description="Search every member of Congress by name, chamber, party, or the place they represent, then open anyone's record to see what they have put their name to."
      />
      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />
      <MemberDirectory congress={congress} members={members} source={source} />
    </SiteShell>
  );
}
