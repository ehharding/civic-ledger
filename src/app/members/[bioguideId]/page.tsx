import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { MemberDetail } from "@/components/members/member-detail";
import { getMemberProfile, MEMBER_LEGISLATION_LIMIT, type MemberProfileResult } from "@/lib/congress/client";
import {
  chamberLabels,
  formatMemberName,
  formatMemberSeat,
  formatMemberTitle,
  type MemberProfile,
} from "@/lib/congress/members/model";
import { previewMemberProfiles } from "@/lib/congress/upstream/fixtures";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { memberHref } from "@/lib/routes";

/** Params for the individual member route (`/members/[bioguideId]`). */
type MemberPageProps = {
  params: Promise<{ bioguideId: string }>;
};

/**
 * Pre-renders the placeholder members — a performance win on a server build, and the only member pages a static export
 * has.
 *
 * @returns One params object per preview member fixture.
 */
export function generateStaticParams(): { bioguideId: string }[] {
  return previewMemberProfiles.map((profile: MemberProfile): { bioguideId: string } => ({
    bioguideId: profile.bioguideId,
  }));
}

/**
 * Builds the per-member title and description. Shares the page's read: `getMemberProfile` is memoized per render.
 *
 * @param params - The member's route params.
 * @returns The member's metadata, or a "Member Not Found" title when the ID doesn't resolve.
 */
export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { bioguideId } = await params;
  const { profile }: MemberProfileResult = await getMemberProfile(bioguideId);

  if (!profile) return notFoundMetadata("Member Not Found");

  const seat: string = formatMemberSeat(profile, profile.chamber);

  return pageMetadata({
    title: `${formatMemberName(profile)} — ${formatMemberTitle(profile)}`,
    description:
      seat.length > 0 ? `${formatMemberTitle(profile)} representing ${seat}.` : chamberLabels[profile.chamber],
    path: memberHref(profile.bioguideId),
  });
}

/**
 * Individual member route, keyed on Bioguide ID.
 *
 * @param params - The member's route params, untrusted. @see normalizeBioguideId
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
