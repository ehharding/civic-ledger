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
 * Pre-renders the placeholder committees at build time.
 *
 * In the default server build this is only a performance win — every real committee is rendered on its first visit and
 * cached from then on. In a static export these are the *only* committee pages that can exist, since there's no server
 * left at request time and no key to look anything up with.
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
 * @param params - The committee's route params.
 * @returns The committee's metadata. @see committeeMetadata
 */
export function generateMetadata({ params }: CommitteePageProps): Promise<Metadata> {
  return committeeMetadata(params);
}

/**
 * Individual committee route, showing its default record view.
 *
 * A URL carrying `?records=` or `?page=` is rewritten to the `/query` twin instead, so this half never reads its query
 * and is cached per committee rather than rendered per visit. @see src/lib/query-routes.ts.
 *
 * @param params - The committee's route params.
 * @returns The committee page. @see renderCommitteeRoute
 */
export default function CommitteePage({ params }: CommitteePageProps): Promise<JSX.Element> {
  return renderCommitteeRoute(params, NO_SEARCH_PARAMS);
}
