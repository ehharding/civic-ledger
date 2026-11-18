import { getCurrentCongress } from "@/lib/congress/current-congress";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
  type RosterShortfall,
} from "@/lib/congress/members/model";
import {
  type CongressApiMember,
  type CongressApiMemberListResponse,
  congressApiMemberListResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { buildPreviewComposition } from "@/lib/congress/upstream/fixtures";
import {
  buildCongressUrl,
  type CongressRequestResult,
  fetchAllPages,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  MEMBER_LIST_CACHE_TAG,
  type PagedList,
  requestCongressJson,
} from "@/lib/congress/upstream/http";
import { mapCongressMember, mapUsable, type SeatedMember } from "@/lib/congress/upstream/mappers";
import { formatOrdinal } from "@/lib/format";

/**
 * Who holds each seat in each chamber of a Congress — the data behind the home page's chamber diagram. Never throws and
 * always reports provenance.
 *
 * @see seating.ts for the geometry.
 */

/**
 * Hard ceiling on member pages fetched for one Congress (~541 members), so a malformed `pagination.count` can't cause
 * an unbounded fetch loop.
 */
const MAX_MEMBER_PAGES: number = 4;

/** One request for a page of the member list. */
type MemberPageRequest = {
  /** The server-only Congress.gov key. */
  apiKey: string;
  /** The Congress to read. */
  congress: number;
  /** The page offset. */
  offset: number;
  /**
   * Whether to ask only for sitting members. `true` for the seated Congress (otherwise mid-term replacements
   * double-count) and `false` for a past one (otherwise only members still serving today come back — 377 of the 117th's
   * 557).
   */
  currentOnly: boolean;
};

/**
 * Fetches one page of the member list for a Congress.
 *
 * @param input - {@link MemberPageRequest}.
 * @returns The validated page, or `null` on any failure — so the caller can decide whether a partial result is still
 *   worth rendering.
 */
async function fetchMemberPage(input: MemberPageRequest): Promise<CongressApiMemberListResponse | null> {
  const url: URL = buildCongressUrl(`/member/congress/${input.congress}`, input.apiKey, {
    limit: String(MAX_API_PAGE_SIZE),
    offset: String(input.offset),
    currentMember: String(input.currentOnly),
  });

  const result: CongressRequestResult<CongressApiMemberListResponse> = await requestCongressJson(
    url,
    [MEMBER_LIST_CACHE_TAG],
    congressApiMemberListResponseSchema,
    `member page at offset ${input.offset} for the ${formatOrdinal(input.congress)} Congress`,
  );

  return result.outcome === "ok" ? result.data : null;
}

/**
 * Fetches a Congress's whole member roster, across as many pages as it takes.
 *
 * @param apiKey - The server-only Congress.gov key.
 * @param congress - The Congress whose roster to read.
 * @param currentOnly - Whether to ask only for sitting members.
 * @returns Every member found with Congress.gov's count beside it, or `null` only when the *first* page fails; a later
 *   failure yields what arrived, and the count is what lets the composition say it is short.
 * @see fetchMemberPage for why this varies by Congress.
 * @see fetchAllPages
 */
function fetchAllMembers(
  apiKey: string,
  congress: number,
  currentOnly: boolean,
): Promise<PagedList<CongressApiMember> | null> {
  return fetchAllPages(
    (offset: number): Promise<CongressApiMemberListResponse | null> =>
      fetchMemberPage({ apiKey, congress, offset, currentOnly }),
    (page: CongressApiMemberListResponse): CongressApiMember[] | undefined => page.members,
    MAX_MEMBER_PAGES,
  );
}

/**
 * Groups mapped members into one {@link ChamberComposition} per chamber.
 *
 * @param members - Members already paired with the chamber they sit in.
 * @returns One composition per chamber, in `congressChambers` order.
 */
function buildComposition(members: SeatedMember[]): ChamberComposition[] {
  return congressChambers.map(
    (chamber: CongressChamber): ChamberComposition =>
      buildChamberComposition(
        chamber,
        members
          .filter((entry: SeatedMember): boolean => entry.chamber === chamber)
          .map((entry: SeatedMember): CongressMember => entry.member),
      ),
  );
}

/**
 * Fetches who holds each seat in both chambers of a Congress. An empty chamber means the fetch failed.
 *
 * @param congress - The Congress whose membership to read. Defaults to the one currently seated, and reading any other
 *   one changes the question asked upstream.
 * @returns The composition, labeled live or preview; a missing key or failed request yields placeholder seats. A live
 *   roster that arrived short of Congress.gov's own count is still drawn, and carries a `shortfall` saying so.
 * @see fetchMemberPage
 */
export async function getCongressComposition(congress: number = getCurrentCongress()): Promise<CongressComposition> {
  const apiKey: string | undefined = getCongressApiKey();
  const retrievedAt: string = new Date().toISOString();
  const currentOnly: boolean = congress >= getCurrentCongress();

  // The missing-key notice is `buildPreviewComposition`'s default, so it is spelled once, beside the placeholders.
  if (!apiKey) return buildPreviewComposition(congress, retrievedAt);

  const list: PagedList<CongressApiMember> | null = await fetchAllMembers(apiKey, congress, currentOnly);
  const chambers: ChamberComposition[] = buildComposition(mapUsable(list?.items ?? [], mapCongressMember));

  if (!list || chambers.some((chamber: ChamberComposition): boolean => chamber.members.length === 0)) {
    return buildPreviewComposition(
      congress,
      retrievedAt,
      "Live membership is temporarily unavailable, so placeholder seats are shown.",
    );
  }

  // Measured on the raw records rather than the mapped seats: a record the mapper drops for having no chamber did
  // arrive, and calling it missing would blame Congress.gov for a record this app chose not to draw.
  const shortfall: RosterShortfall | undefined =
    list.items.length < list.total ? { expected: list.total, received: list.items.length } : undefined;

  return { congress, chambers, source: "live", retrievedAt, ...(shortfall ? { shortfall } : {}) };
}
