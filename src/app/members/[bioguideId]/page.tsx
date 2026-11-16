import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { MemberDetail } from "@/components/members/member-detail";
import { getMemberProfile, MEMBER_LEGISLATION_LIMIT, type MemberProfileResult } from "@/lib/congress/client";
import { refuseDegradedRender } from "@/lib/congress/live-render";
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

/** This route's pattern, as a refused render names it. */
const MEMBER_ROUTE: string = "/members/[bioguideId]";

/** The dynamic segment of `/members/[bioguideId]`. */
type MemberRouteParams = {
  /** The member's Bioguide ID, as it appears in the URL. */
  bioguideId: string;
};

/** Props for the individual member route. */
type MemberPageProps = {
  /** The dynamic segment, as Next hands it over. */
  params: Promise<MemberRouteParams>;
};

/**
 * Pre-renders the placeholder members — a performance win on a server build, and the only member pages a static export
 * has.
 *
 * @returns One params object per preview member fixture.
 */
export function generateStaticParams(): MemberRouteParams[] {
  return previewMemberProfiles.map(
    (profile: MemberProfile): MemberRouteParams => ({
      bioguideId: profile.bioguideId,
    }),
  );
}

/**
 * Builds the per-member title and description. Shares the page's read: `getMemberProfile` is memoized per render.
 *
 * @param params - The member's route params.
 * @returns The member's metadata, or a "Member Not Found" title when the ID doesn't resolve.
 */
export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { bioguideId } = await params;
  const { profile, source }: MemberProfileResult = await getMemberProfile(bioguideId);

  refuseDegradedRender(source === "preview", MEMBER_ROUTE);
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
 * @param params - The member's route params, untrusted.
 * @returns The member page, or the 404 page when the ID resolves to nobody.
 * @see normalizeBioguideId
 */
export default async function MemberPage({ params }: MemberPageProps): Promise<JSX.Element> {
  const { bioguideId } = await params;
  const { profile, sponsored, cosponsored, source, notice, retrievedAt }: MemberProfileResult =
    await getMemberProfile(bioguideId);

  refuseDegradedRender(source === "preview", MEMBER_ROUTE);
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
