import type { ZodType } from "zod";

import {
  type CongressApiBill,
  type CongressApiCosponsoredLegislationResponse,
  type CongressApiMemberDetailResponse,
  type CongressApiSponsoredLegislationResponse,
  congressApiCosponsoredLegislationResponseSchema,
  congressApiMemberDetailResponseSchema,
  congressApiSponsoredLegislationResponseSchema,
} from "@/lib/congress/api-schema";
import { findPreviewMemberProfile, previewMemberLegislation } from "@/lib/congress/fixtures";
import {
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  memberCacheTags,
  normalizeBioguideId,
  requestCongressJson,
} from "@/lib/congress/http";
import { mapCongressBill, mapMemberProfile, mapUsable } from "@/lib/congress/mappers";
import type { MemberProfile } from "@/lib/congress/members";
import { type CongressSnapshot, compareBillsByRecency, type LegislativeBill } from "@/lib/congress/types";

/**
 * Everything the individual member page reads: one member's own record, plus the legislation they sponsored and
 * cosponsored.
 *
 * Follows the same two invariants as `bills.ts` — nothing throws, and provenance travels with the data — for the same
 * reason: a member page should degrade to a clearly labeled preview, never to an error boundary.
 *
 * The member *list* endpoint the chamber chart uses is a deliberately different module (`composition.ts`). The two
 * answer different questions ("who holds every seat" versus "who is this person"), hit different endpoints, and return
 * different shapes; the only thing they share is the model in `members.ts`.
 *
 * @see http.ts for the transport and caching policy.
 */

/**
 * How many of a member's bills to show on their page, per list.
 *
 * A long-serving member can have thousands of each. This is a page about a person, not an exhaustive legislative
 * index — the full count is stated in text beside each list, and the official record is one link away, so the cap
 * shortens the page without hiding the scale of what it's showing a slice of.
 */
export const MEMBER_LEGISLATION_LIMIT: number = 12;

/** What {@link getMemberProfile} resolved: the member (if any), their legislation, and where all of it came from. */
export type MemberProfileResult = {
  /** `undefined` means "no such member" and should render as a 404 — never "something went wrong". */
  profile: MemberProfile | undefined;
  /** Bills this member sponsored, most recently introduced first, capped at {@link MEMBER_LEGISLATION_LIMIT}. */
  sponsored: LegislativeBill[];
  /** Bills this member cosponsored, same ordering and cap. */
  cosponsored: LegislativeBill[];
  source: CongressSnapshot["source"];
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
  retrievedAt: string;
};

/**
 * Fetches one of a member's legislation lists (`/sponsored-legislation`, `/cosponsored-legislation`).
 *
 * The two differ only in their path segment, their payload schema, and which key holds the collection, so — exactly as
 * with the bill sub-resources in `bills.ts` — the request, the page-size ceiling, and the "an absent list is an empty
 * list, not an error" policy live here once.
 *
 * @typeParam Payload - The validated response shape for this list.
 * @param bioguideId - The member's validated Bioguide ID.
 * @param apiKey - The server-only Congress.gov key.
 * @param config - The list's path suffix, schema, and the collection to read off the payload.
 * @returns The mapped bills, newest first, capped at {@link MEMBER_LEGISLATION_LIMIT}. Always an empty array on a 404
 *   or a failure — a member with no sponsored bills is an ordinary state (every member has one on their first day).
 *
 *   The ordering is applied here rather than assumed. Congress.gov does return these lists newest first, so this
 *   normally changes nothing — but "newest first" is a promise this app's own type makes to the page that renders it,
 *   and a promise kept by an upstream convention is one that breaks silently the day the convention does. Note what
 *   this is *not*: the request is already capped at {@link MEMBER_LEGISLATION_LIMIT}, so this orders the page it was
 *   given and cannot re-rank a larger set it never asked for.
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
 * Looks up one member of Congress by Bioguide ID, together with the legislation they sponsored and cosponsored.
 *
 * The three reads are independent, so they go out together rather than one after another. A member whose legislation
 * lists fail still gets a page — the profile is the substance of it, and an empty list section is honest about having
 * nothing to show.
 *
 * @param rawBioguideId - The `bioguideId` route param, straight from the URL and therefore untrusted.
 * @returns The result, always labeled live or preview. An ID that isn't a real Bioguide ID is resolved against the
 *   preview fixtures rather than sent upstream, so the preview member pages work without a key and a malformed ID can
 *   never reach Congress.gov. This never throws.
 */
export async function getMemberProfile(rawBioguideId: string): Promise<MemberProfileResult> {
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
      // Three genuinely different situations land here, and only one of them is "no key". A malformed ID with a key
      // configured is a bad URL, not a configuration problem, and shouldn't be reported as one — even though the route
      // renders an unresolved profile as a 404 before this notice can be read, since that is exactly the kind of
      // almost-unreachable wording that goes quietly wrong the first time it becomes reachable.
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

  // A transient failure shouldn't be indistinguishable from "no such member" — fall back to the preview fixtures, the
  // same last resort every other read in this adapter uses.
  const fallback: MemberProfile | undefined = findPreviewMemberProfile(bioguideId);

  return {
    profile: fallback,
    ...previewMemberLegislation(fallback?.bioguideId),
    source: "preview",
    retrievedAt,
    notice: "Live member records are temporarily unavailable.",
  };
}
