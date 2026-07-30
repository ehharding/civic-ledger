import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { CommitteeDetail } from "@/components/committee-detail";
import { type CommitteeProfileResult, getCommitteeProfile } from "@/lib/congress/client";
import { type CommitteeProfile, describeCommittee } from "@/lib/congress/committees";
import { previewCommitteeProfiles } from "@/lib/congress/fixtures";

/** Params for the individual committee route (`/committees/[chamber]/[systemCode]`). */
type CommitteePageProps = {
  params: Promise<{ chamber: string; systemCode: string }>;
};

/**
 * Pre-renders the placeholder committees at build time.
 *
 * In the default server build this is only a performance win — every real committee still resolves live, on demand. In
 * a static export these are the *only* committee pages that can exist, since there's no server left at request time
 * and no key to look anything up with.
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

  if (!profile) return { title: "Committee Not Found" };

  return {
    title: profile.name,
    description: describeCommittee(profile),
  };
}

/**
 * Individual committee route.
 *
 * Both segments are part of the identifier rather than one being decoration: Congress.gov's committee endpoint is keyed
 * on chamber *and* system code, so a URL carrying only the code would have to guess the chamber back before it could
 * look anything up. @see committeeHref, and `normalizeCommitteeChamberSegment` for the guard that keeps a malformed
 * segment from reaching Congress.gov.
 *
 * @param params - The committee's route params, straight from the URL and therefore untrusted.
 * @returns The committee page, or the 404 page when the identifiers resolve to nothing.
 */
export default async function CommitteePage({ params }: CommitteePageProps): Promise<JSX.Element> {
  const { chamber, systemCode } = await params;
  const { profile, source, notice, retrievedAt }: CommitteeProfileResult = await getCommitteeProfile(
    chamber,
    systemCode,
  );

  if (!profile) notFound();

  return <CommitteeDetail notice={notice} profile={profile} retrievedAt={retrievedAt} source={source} />;
}
