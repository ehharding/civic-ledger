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
import { refuseDegradedRender } from "@/lib/congress/live-render";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { committeeHref } from "@/lib/routes";
import { type RouteSearchParams, resolveCommitteeRecordsQuery } from "@/lib/search-params";

/** The cached committee route's pattern, as a refused render names it. */
export const COMMITTEE_ROUTE: string = "/committees/[chamber]/[systemCode]";

/** The route params `/committees/[chamber]/[systemCode]` and its `/query` twin share. */
export type CommitteeParams = Promise<{ chamber: string; systemCode: string }>;

/**
 * Builds the per-committee title and description. Shares the page's read: `getCommitteeProfile` is memoized per render.
 *
 * @param params - The committee's route params.
 * @param cachedAs - The cached route this is stored as, omitted by the on-demand twin. Refused before the not-found
 *   title, which a failed lookup would otherwise earn. See refuseDegradedRender.
 * @returns The committee's metadata, or a "Committee Not Found" title when the identifiers don't resolve.
 */
export async function committeeMetadata(params: CommitteeParams, cachedAs?: string): Promise<Metadata> {
  const { chamber, systemCode } = await params;
  const { profile, source }: CommitteeProfileResult = await getCommitteeProfile(chamber, systemCode);

  refuseDegradedRender(source === "preview", cachedAs);
  if (!profile) return notFoundMetadata("Committee Not Found");

  return pageMetadata({
    title: profile.name,
    description: describeCommittee(profile),
    path: committeeHref(profile.chamber, profile.systemCode),
  });
}

/**
 * Renders one committee's page. Chamber and system code together identify it, as on Congress.gov.
 *
 * The records are fetched *after* the committee's record, because its counts clamp `?page=` before an offset goes
 * upstream.
 *
 * Shared by the cached route (no query) and its on-demand `/query` twin.
 *
 * @param params - The committee's route params, straight from the URL and therefore untrusted.
 * @param searchParams - The record view's query params, equally untrusted and equally parsed rather than read.
 * @param cachedAs - The cached route this render is stored as. The on-demand twin omits it, since its render is never
 *   cached; see {@link refuseDegradedRender}.
 * @returns The committee page, or the 404 page when the identifiers resolve to nothing.
 * @see committeeHref
 * @see clampCommitteeRecordsPage
 * @see src/lib/query-routes.ts
 */
export async function renderCommitteeRoute(
  params: CommitteeParams,
  searchParams: Promise<RouteSearchParams>,
  cachedAs?: string,
): Promise<JSX.Element> {
  const [{ chamber, systemCode }, query]: [{ chamber: string; systemCode: string }, CommitteeRecordsQuery] =
    await Promise.all([params, resolveCommitteeRecordsQuery(searchParams)]);

  const { profile, source, notice, retrievedAt }: CommitteeProfileResult = await getCommitteeProfile(
    chamber,
    systemCode,
  );

  refuseDegradedRender(source === "preview", cachedAs);
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
