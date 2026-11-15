import type { Metadata } from "next";
import type { JSX } from "react";

import {
  type CommitteeParams,
  committeeMetadata,
  renderCommitteeRoute,
} from "@/app/committees/[chamber]/[systemCode]/render";
import type { CommitteeProfile } from "@/lib/congress/committees/model";
import { previewCommitteeProfiles } from "@/lib/congress/upstream/fixtures";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/** Params for the individual committee route (`/committees/[chamber]/[systemCode]`). */
type CommitteePageProps = {
  params: CommitteeParams;
};

/**
 * Pre-renders the placeholder committees and their subcommittees (which parent pages link to) — a performance win on a
 * server build, and the only committee pages a static export has.
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
 * @param params - The committee's route params.
 * @returns The committee's metadata.
 * @see committeeMetadata
 */
export function generateMetadata({ params }: CommitteePageProps): Promise<Metadata> {
  return committeeMetadata(params);
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
  return renderCommitteeRoute(params, NO_SEARCH_PARAMS);
}
