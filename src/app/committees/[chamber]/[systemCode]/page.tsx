import type { Metadata } from "next";
import type { JSX } from "react";

import {
  COMMITTEE_ROUTE,
  type CommitteeParams,
  type CommitteeRouteParams,
  committeeMetadata,
  renderCommitteeRoute,
} from "@/app/committees/[chamber]/[systemCode]/render";
import type { CommitteeProfile, Subcommittee } from "@/lib/congress/committees/model";
import { previewCommitteeProfiles } from "@/lib/congress/upstream/fixtures";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/** Params for the individual committee route (`/committees/[chamber]/[systemCode]`). */
type CommitteePageProps = {
  /** The dynamic segments, as Next hands them over. */
  params: CommitteeParams;
};

/**
 * Pre-renders the placeholder committees and their subcommittees (which parent pages link to) — a performance win on a
 * server build, and the only committee pages a static export has.
 *
 * @returns One params object per preview committee and preview subcommittee.
 */
export function generateStaticParams(): CommitteeRouteParams[] {
  return previewCommitteeProfiles.flatMap((profile: CommitteeProfile): CommitteeRouteParams[] => [
    { chamber: profile.chamber, systemCode: profile.systemCode },
    ...profile.subcommittees.map(
      (subcommittee: Subcommittee): CommitteeRouteParams => ({
        chamber: profile.chamber,
        systemCode: subcommittee.systemCode,
      }),
    ),
  ]);
}

/**
 * @param params - The committee's route params.
 * @returns The committee's metadata.
 * @see committeeMetadata
 */
export function generateMetadata({ params }: CommitteePageProps): Promise<Metadata> {
  return committeeMetadata(params, COMMITTEE_ROUTE);
}

/**
 * Individual committee route, showing its default record view.
 *
 * A URL carrying `?records=` or `?page=` is rewritten to the `/query` twin instead, so this half never reads its query
 * and is cached per committee rather than rendered per visit.
 *
 * @param params - The committee's route params.
 * @returns The committee page.
 * @see src/lib/query-routes.ts
 * @see renderCommitteeRoute
 */
export default function CommitteePage({ params }: CommitteePageProps): Promise<JSX.Element> {
  return renderCommitteeRoute(params, NO_SEARCH_PARAMS, COMMITTEE_ROUTE);
}
