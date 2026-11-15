import { cache } from "react";
import type { ZodType } from "zod";

import { type CongressSnapshot, compareBillsByRecency, type LegislativeBill } from "@/lib/congress/bills/model";
import type { MemberProfile } from "@/lib/congress/members/model";
import {
  type CongressApiBill,
  type CongressApiCosponsoredLegislationResponse,
  type CongressApiMemberDetailResponse,
  type CongressApiSponsoredLegislationResponse,
  congressApiCosponsoredLegislationResponseSchema,
  congressApiMemberDetailResponseSchema,
  congressApiSponsoredLegislationResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { findPreviewMemberProfile, previewMemberLegislation } from "@/lib/congress/upstream/fixtures";
import {
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  memberCacheTags,
  normalizeBioguideId,
  requestCongressJson,
} from "@/lib/congress/upstream/http";
import { mapCongressBill, mapMemberProfile, mapUsable } from "@/lib/congress/upstream/mappers";

/**
 * Everything the member page reads: one member's record plus the legislation they sponsored and cosponsored. Nothing
 * throws, and provenance travels with the data.
 * @see composition.ts for the chamber-wide list.
 */

/** How many of a member's bills to show per list. The page links to the full official record. */
export const MEMBER_LEGISLATION_LIMIT: number = 12;

/** What {@link getMemberProfile} resolved: the member (if any), their legislation, and where all of it came from. */
export type MemberProfileResult = {
  /** `undefined` means "no such member" and should render as a 404 — never "something went wrong". */
  profile: MemberProfile | undefined;
  /** Bills this member sponsored, most recently introduced first, capped at {@link MEMBER_LEGISLATION_LIMIT}. */
  sponsored: LegislativeBill[];
  /** Bills this member cosponsored, same ordering and cap. */
  cosponsored: LegislativeBill[];
  /** Whether these are live records or labeled placeholders. */
  source: CongressSnapshot["source"];
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
  /** When the read happened, as an ISO timestamp. */
  retrievedAt: string;
};

/**
 * Fetches one of a member's legislation lists (`/sponsored-legislation` or `/cosponsored-legislation`).
 *
 * @typeParam Payload - The validated response shape for this list.
 * @param bioguideId - The member's validated Bioguide ID.
 * @param apiKey - The server-only Congress.gov key.
 * @param config - The list's path suffix, schema, and the collection to read off the payload.
 * @returns The mapped bills, capped at {@link MEMBER_LEGISLATION_LIMIT}, or `[]` on a 404 or failure. Sorted newest
 *   first here rather than trusting upstream order (this only reorders the capped page, not the full set).
 */
async function fetchMemberLegislation<Payload>(
  bioguideId: string,
  apiKey: string,
  config: {
    path: "sponsored-legislation" | "cosponsored-legislation";
    schema: ZodType<Payload>;
    select: (payload: Payload) => CongressApiBill[] | undefined;
  },
): Promise<LegislativeBill[]> {
  const url: URL = buildCongressUrl(`/member/${bioguideId}/${config.path}`, apiKey, {
    limit: String(MEMBER_LEGISLATION_LIMIT),
  });

  const result: CongressRequestResult<Payload> = await requestCongressJson(
    url,
    memberCacheTags(bioguideId),
    config.schema,
    `${config.path} for member ${bioguideId}`,
  );

  if (result.outcome !== "ok") return [];

  return mapUsable(config.select(result.data), mapCongressBill)
    .sort(compareBillsByRecency)
    .slice(0, MEMBER_LEGISLATION_LIMIT);
}

/**
 * Looks up one member by Bioguide ID, with their sponsored and cosponsored legislation, in parallel. Failed legislation
 * lists still leave a page.
 *
 * @param rawBioguideId - The `bioguideId` route param, straight from the URL and therefore untrusted.
 * @returns The result, labeled live or preview. A malformed ID is resolved against the preview fixtures and never sent
 *   upstream. Never throws.
 */
export function getMemberProfile(rawBioguideId: string): Promise<MemberProfileResult> {
  return lookUpMemberOnce(rawBioguideId);
}

/**
 * {@link getMemberProfile}, memoized for one server render: the route reads it in both `generateMetadata` and the page,
 * and Next's `fetch` dedupe skips requests carrying an `AbortSignal` (ours all do).
 */
const lookUpMemberOnce = cache(lookUpMemberProfile);

/** The uncached body of {@link getMemberProfile}. */
async function lookUpMemberProfile(rawBioguideId: string): Promise<MemberProfileResult> {
  const retrievedAt: string = new Date().toISOString();
  const apiKey: string | undefined = getCongressApiKey();
  const bioguideId: string | null = normalizeBioguideId(rawBioguideId);

  if (!apiKey || bioguideId === null) {
    const profile: MemberProfile | undefined = findPreviewMemberProfile(rawBioguideId);

    return {
      profile,
      ...previewMemberLegislation(profile?.bioguideId),
      source: "preview",
      retrievedAt,
      // A malformed ID with a key configured is a bad URL, not a configuration problem.
      notice: profile
        ? "This is an illustrative placeholder member, not a real member of Congress."
        : apiKey
          ? "That is not a valid Bioguide ID, so no member could be looked up."
          : "Placeholder records are shown until a server-only Congress.gov API key is configured.",
    };
  }

  const [detail, sponsored, cosponsored]: [
    CongressRequestResult<CongressApiMemberDetailResponse>,
    LegislativeBill[],
    LegislativeBill[],
  ] = await Promise.all([
    requestCongressJson(
      buildCongressUrl(`/member/${bioguideId}`, apiKey),
      memberCacheTags(bioguideId),
      congressApiMemberDetailResponseSchema,
      `member lookup for ${bioguideId}`,
    ),
    fetchMemberLegislation(bioguideId, apiKey, {
      path: "sponsored-legislation",
      schema: congressApiSponsoredLegislationResponseSchema,
      select: (payload: CongressApiSponsoredLegislationResponse): CongressApiBill[] | undefined =>
        payload.sponsoredLegislation,
    }),
    fetchMemberLegislation(bioguideId, apiKey, {
      path: "cosponsored-legislation",
      schema: congressApiCosponsoredLegislationResponseSchema,
      select: (payload: CongressApiCosponsoredLegislationResponse): CongressApiBill[] | undefined =>
        payload.cosponsoredLegislation,
    }),
  ]);

  if (detail.outcome === "not-found") {
    return { profile: undefined, sponsored: [], cosponsored: [], source: "live", retrievedAt };
  }

  if (detail.outcome === "ok") {
    const profile: MemberProfile | null = detail.data.member ? mapMemberProfile(detail.data.member, bioguideId) : null;

    return { profile: profile ?? undefined, sponsored, cosponsored, source: "live", retrievedAt };
  }

  // A transient failure isn't "no such member": fall back to the preview fixtures.
  const fallback: MemberProfile | undefined = findPreviewMemberProfile(bioguideId);

  return {
    profile: fallback,
    ...previewMemberLegislation(fallback?.bioguideId),
    source: "preview",
    retrievedAt,
    notice: "Live member records are temporarily unavailable.",
  };
}
