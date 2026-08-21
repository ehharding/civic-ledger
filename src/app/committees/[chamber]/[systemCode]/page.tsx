import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { CommitteeDetail } from "@/components/committees/committee-detail";
import { type CommitteeProfileResult, getCommitteeProfile, getCommitteeRecords } from "@/lib/congress/client";
import { type CommitteeProfile, describeCommittee } from "@/lib/congress/committees/model";
import {
  type CommitteeRecordsQuery,
  type CommitteeRecordsResult,
  committeeReportedCount,
} from "@/lib/congress/committees/records";
import { previewCommitteeProfiles } from "@/lib/congress/upstream/fixtures";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { committeeHref } from "@/lib/routes";
import { type RouteSearchParams, resolveCommitteeRecordsQuery } from "@/lib/search-params";

/** Params for the individual committee route (`/committees/[chamber]/[systemCode]`). */
type CommitteePageProps = {
  params: Promise<{ chamber: string; systemCode: string }>;
  /**
   * Which of the committee's record collections to show, and how far into it.
   *
   * Optional so `generateMetadata` and the tests can call the page with params alone — the records section is a view
   * *within* the page rather than a different page, and a committee URL carrying no query is a complete one.
   */
  searchParams?: Promise<RouteSearchParams>;
};

/** An absent `searchParams`, as a resolved promise, so the default view needs no branch below. */
const NO_SEARCH_PARAMS: Promise<RouteSearchParams> = Promise.resolve({});

/**
 * Pre-renders the placeholder committees at build time.
 *
 * In the default server build this is only a performance win — every real committee still resolves live, on demand. In
 * a static export these are the *only* committee pages that can exist, since there's no server left at request time and
 * no key to look anything up with.
 *
 * Subcommittees are included alongside their parents, because a parent's page links to each of them and a link that
 * 404s in the static demo would make the fixtures look broken rather than placeholder.
 *
 * @returns One params object per preview committee and preview subcommittee.
 */
export function generateStaticParams(): { chamber: string; systemCode: string }[] {
  return previewCommitteeProfiles.flatMap((profile: CommitteeProfile): { chamber: string; systemCode: string }[] => [
    { chamber: profile.chamber, systemCode: profile.systemCode },
    ...profile.subcommittees.map((subcommittee: { systemCode: string }): { chamber: string; systemCode: string } => ({
      chamber: profile.chamber,
      systemCode: subcommittee.systemCode,
    })),
  ]);
}

/**
 * Builds the per-committee title and description, so a committee page reads as itself in a browser tab, a share card,
 * or a search result rather than falling back to the site-wide default.
 *
 * Calls `getCommitteeProfile` a second time without a second upstream request: Next memoizes `fetch` per request, so
 * this and the page component below share one response for the same route.
 *
 * @param params - The committee's route params.
 * @returns The committee's metadata, or a "Committee Not Found" title when the identifiers don't resolve.
 */
export async function generateMetadata({ params }: CommitteePageProps): Promise<Metadata> {
  const { chamber, systemCode } = await params;
  const { profile }: CommitteeProfileResult = await getCommitteeProfile(chamber, systemCode);

  if (!profile) return notFoundMetadata("Committee Not Found");

  return pageMetadata({
    title: profile.name,
    description: describeCommittee(profile),
    path: committeeHref(profile.chamber, profile.systemCode),
  });
}

/**
 * Individual committee route.
 *
 * Both segments are part of the identifier rather than one being decoration: Congress.gov's committee endpoint is keyed
 * on chamber *and* system code, so a URL carrying only the code would have to guess the chamber back before it could
 * look anything up. @see committeeHref, and `normalizeCommitteeChamberSegment` for the guard that keeps a malformed
 * segment from reaching Congress.gov.
 *
 * The committee's own record and the record view its URL asks for are resolved together, then the records themselves
 * are fetched second rather than alongside. That order is a dependency rather than a missed parallelization: a `?page=`
 * is only meaningful against a collection whose length is known, and the committee's own counts are what make it
 * possible to hold a requested page inside the collection *before* an offset goes upstream instead of after a wasted
 * round trip has proven it overshot.
 * @see clampCommitteeRecordsPage.
 *
 * @param params - The committee's route params, straight from the URL and therefore untrusted.
 * @param searchParams - The record view's query params, equally untrusted and equally parsed rather than read.
 * @returns The committee page, or the 404 page when the identifiers resolve to nothing.
 */
export default async function CommitteePage({ params, searchParams }: CommitteePageProps): Promise<JSX.Element> {
  const [{ chamber, systemCode }, query]: [{ chamber: string; systemCode: string }, CommitteeRecordsQuery] =
    await Promise.all([params, resolveCommitteeRecordsQuery(searchParams ?? NO_SEARCH_PARAMS)]);

  const { profile, source, notice, retrievedAt }: CommitteeProfileResult = await getCommitteeProfile(
    chamber,
    systemCode,
  );

  if (!profile) notFound();

  const records: CommitteeRecordsResult = await getCommitteeRecords(
    chamber,
    systemCode,
    query,
    committeeReportedCount(profile, query.kind),
  );

  return (
    <CommitteeDetail notice={notice} profile={profile} records={records} retrievedAt={retrievedAt} source={source} />
  );
}
