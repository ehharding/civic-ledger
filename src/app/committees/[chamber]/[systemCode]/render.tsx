import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { CommitteeDetail } from "@/components/committees/committee-detail";
import { type CommitteeProfileResult, getCommitteeProfile, getCommitteeRecords } from "@/lib/congress/client";
import { describeCommittee } from "@/lib/congress/committees/model";
import {
  type CommitteeRecordsQuery,
  type CommitteeRecordsResult,
  committeeReportedCount,
} from "@/lib/congress/committees/records";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { committeeHref } from "@/lib/routes";
import { type RouteSearchParams, resolveCommitteeRecordsQuery } from "@/lib/search-params";

/** The route params `/committees/[chamber]/[systemCode]` and its `/query` twin share. */
export type CommitteeParams = Promise<{ chamber: string; systemCode: string }>;

/**
 * Builds the per-committee title and description, so a committee page reads as itself in a browser tab, a share card,
 * or a search result rather than falling back to the site-wide default.
 *
 * Calls `getCommitteeProfile` a second time without a second upstream request: Next memoizes `fetch` per request, so
 * this and the page renderer below share one response for the same route.
 *
 * @param params - The committee's route params.
 * @returns The committee's metadata, or a "Committee Not Found" title when the identifiers don't resolve.
 */
export async function committeeMetadata(params: CommitteeParams): Promise<Metadata> {
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
 * Renders one committee's page.
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
 * Shared by `/committees/[chamber]/[systemCode]`, which passes no query and is therefore cached per committee, and its
 * `/query` twin, which passes the `?records=`/`?page=` view and renders on demand. @see src/lib/query-routes.ts.
 *
 * @param params - The committee's route params, straight from the URL and therefore untrusted.
 * @param searchParams - The record view's query params, equally untrusted and equally parsed rather than read.
 * @returns The committee page, or the 404 page when the identifiers resolve to nothing.
 */
export async function renderCommitteeRoute(
  params: CommitteeParams,
  searchParams: Promise<RouteSearchParams>,
): Promise<JSX.Element> {
  const [{ chamber, systemCode }, query]: [{ chamber: string; systemCode: string }, CommitteeRecordsQuery] =
    await Promise.all([params, resolveCommitteeRecordsQuery(searchParams)]);

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
