import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { MemberDetail } from "@/components/member-detail";
import { getMemberProfile, MEMBER_LEGISLATION_LIMIT, type MemberProfileResult } from "@/lib/congress/client";
import { previewMemberProfiles } from "@/lib/congress/fixtures";
import {
  chamberLabels,
  formatMemberName,
  formatMemberSeat,
  formatMemberTitle,
  type MemberProfile,
} from "@/lib/congress/members";

/** Params for the individual member route (`/members/[bioguideId]`). */
type MemberPageProps = {
  params: Promise<{ bioguideId: string }>;
};

/**
 * Pre-renders the placeholder members at build time.
 *
 * In the default server build this is only a performance win — every real member still resolves live, on demand. In a
 * static export these are the *only* member pages that can exist, since there's no server left at request time and no
 * key to look anyone up with.
 *
 * @returns One params object per preview member fixture.
 */
export function generateStaticParams(): { bioguideId: string }[] {
  return previewMemberProfiles.map((profile: MemberProfile): { bioguideId: string } => ({
    bioguideId: profile.bioguideId,
  }));
}

/**
 * Builds the per-member title and description, so a member page reads as itself in a browser tab, a share card, or a
 * search result rather than falling back to the site-wide default.
 *
 * Calls `getMemberProfile` a second time without a second upstream request: Next memoizes `fetch` per request, so this
 * and the page component below share one response for the same route.
 *
 * @param params - The member's route params.
 * @returns The member's metadata, or a "Member Not Found" title when the ID doesn't resolve.
 */
export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { bioguideId } = await params;
  const { profile }: MemberProfileResult = await getMemberProfile(bioguideId);

  if (!profile) return { title: "Member Not Found" };

  const seat: string = formatMemberSeat(profile, profile.chamber);

  return {
    title: `${formatMemberName(profile)} — ${formatMemberTitle(profile)}`,
    description:
      seat.length > 0 ? `${formatMemberTitle(profile)} representing ${seat}.` : chamberLabels[profile.chamber],
  };
}

/**
 * Individual member route.
 *
 * Reached from any seat in the home page's chamber diagram, from a bill's sponsor line, and from any other place a
 * person is named — so the Bioguide ID in the URL is the same identifier the rest of the app already keys members on.
 *
 * @param params - The member's route params, straight from the URL and therefore untrusted.
 *   @see normalizeBioguideId for the guard that keeps a malformed ID from reaching Congress.gov.
 * @returns The member page, or the 404 page when the ID resolves to nobody.
 */
export default async function MemberPage({ params }: MemberPageProps): Promise<JSX.Element> {
  const { bioguideId } = await params;
  const { profile, sponsored, cosponsored, source, notice, retrievedAt }: MemberProfileResult =
    await getMemberProfile(bioguideId);

  if (!profile) notFound();

  return (
    <MemberDetail
      cosponsored={cosponsored}
      legislationLimit={MEMBER_LEGISLATION_LIMIT}
      notice={notice}
      profile={profile}
      retrievedAt={retrievedAt}
      source={source}
      sponsored={sponsored}
    />
  );
}
