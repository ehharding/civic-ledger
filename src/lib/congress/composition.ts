import {
  type CongressApiMember,
  type CongressApiMemberListResponse,
  congressApiMemberListResponseSchema,
} from "@/lib/congress/api-schema";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { buildPreviewComposition } from "@/lib/congress/fixtures";
import {
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  MEMBER_LIST_CACHE_TAG,
  requestCongressJson,
} from "@/lib/congress/http";
import { mapCongressMember, mapUsable, type SeatedMember } from "@/lib/congress/mappers";
import {
  buildChamberComposition,
  type ChamberComposition,
  type CongressChamber,
  type CongressComposition,
  type CongressMember,
  congressChambers,
} from "@/lib/congress/members";
import { formatOrdinal } from "@/lib/format";

/**
 * Who currently holds each seat in each chamber of a Congress — the data behind the home page's chamber diagram.
 *
 * Member reads follow the same rules as bill reads (never throw, always report provenance), with one wrinkle bills
 * don't have: the member list is genuinely large, so it paginates. That pagination, and the decision about what makes a
 * *partial* roster still worth rendering, is the substance of this module.
 *
 * @see seating.ts for the geometry that turns a composition into a picture — deliberately a separate, React-free,
 *   Congress.gov-free module.
 */

/**
 * Hard ceiling on member pages fetched for one Congress.
 *
 * A seated Congress is a little over 540 members (535 voting seats plus the six non-voting House seats, minus any
 * vacancies), so three pages of {@link MAX_API_PAGE_SIZE} covers it with room to spare. The cap exists so a malformed
 * `pagination.count` can't turn one page render into an unbounded fetch loop.
 */
const MAX_MEMBER_PAGES: number = 4;

/**
 * Fetches one page of the member list for a Congress.
 *
 * `currentMember` is the parameter that decides *which question this is*, and the right answer depends on which
 * Congress is being read — which is why it is passed in rather than fixed here.
 *
 * For the Congress currently seated, `true` makes this "who holds a seat right now" rather than "everyone who served at
 * any point in it": without it, a member who resigned mid-term and the member who replaced them both come back, and the
 * chamber over-counts. For a *past* Congress the same value is straightforwardly wrong, and Congress.gov's own
 * documentation makes the mirror-image recommendation. The 117th Congress answers `currentMember=true` with 377
 * members — the subset of it still serving today — against 557 for the full historical roster. A chamber diagram drawn
 * from the first would be missing a third of its seats while presenting itself as the whole body.
 *
 * @param input - The API key, the Congress to read, the page offset, and whether to ask only for sitting members.
 * @returns The validated page, or `null` on any failure — so the caller can decide whether a partial result is still
 *   worth rendering.
 */
async function fetchMemberPage(input: {
  apiKey: string;
  congress: number;
  offset: number;
  currentOnly: boolean;
}): Promise<CongressApiMemberListResponse | null> {
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
 * Fetches every currently-seated member of a Congress, across as many pages as it takes.
 *
 * The first page is fetched on its own to read `pagination.count`, and the remaining pages then go out together rather
 * than one after another — two round trips instead of three sequential ones.
 *
 * @param apiKey - The server-only Congress.gov key.
 * @param congress - The Congress whose roster to read.
 * @param currentOnly - Whether to ask only for sitting members. @see fetchMemberPage for why this varies by Congress.
 * @returns Every member found, or `null` only when the *first* page fails. A later page failing yields the members that
 *   did arrive, since a chart of most of the chamber still beats no chart at all — the missing seats simply aren't
 *   drawn.
 */
async function fetchAllMembers(
  apiKey: string,
  congress: number,
  currentOnly: boolean,
): Promise<CongressApiMember[] | null> {
  const firstPage: CongressApiMemberListResponse | null = await fetchMemberPage({
    apiKey,
    congress,
    offset: 0,
    currentOnly,
  });
  if (!firstPage) return null;

  const firstMembers: CongressApiMember[] = firstPage.members ?? [];
  const total: number = firstPage.pagination?.count ?? firstMembers.length;
  const pageCount: number = Math.min(MAX_MEMBER_PAGES, Math.ceil(total / MAX_API_PAGE_SIZE));

  if (pageCount <= 1) return firstMembers;

  const laterPages: (CongressApiMemberListResponse | null)[] = await Promise.all(
    Array.from(
      { length: pageCount - 1 },
      (_unused: unknown, index: number): Promise<CongressApiMemberListResponse | null> =>
        fetchMemberPage({ apiKey, congress, offset: (index + 1) * MAX_API_PAGE_SIZE, currentOnly }),
    ),
  );

  return [
    ...firstMembers,
    ...laterPages.flatMap((page: CongressApiMemberListResponse | null): CongressApiMember[] => page?.members ?? []),
  ];
}

/**
 * Groups mapped members into one {@link ChamberComposition} per chamber.
 *
 * @param members - Members already paired with the chamber they sit in.
 * @returns One composition per chamber, in `congressChambers` order, so the UI's tab order is stable regardless of what
 *   order the upstream list happened to arrive in.
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
 * Fetches the membership of both chambers of a Congress — who currently holds each seat — for the home page's chamber
 * diagram.
 *
 * A chamber that comes back empty is treated as a failure of the whole fetch rather than rendered as an empty half of
 * Congress: "the Senate has no members" is never a true statement about a seated Congress, and a diagram showing it
 * would read as one.
 *
 * @param congress - The Congress whose membership to read. Defaults to the one currently seated, and reading any other
 *   one changes the question asked upstream — @see fetchMemberPage.
 * @returns The composition, always labeled live or preview. A missing key or a failed request yields clearly labeled
 *   placeholder seats rather than an empty or broken chart; this never throws.
 */
export async function getCongressComposition(congress: number = getCurrentCongress()): Promise<CongressComposition> {
  const apiKey: string | undefined = getCongressApiKey();
  const retrievedAt: string = new Date().toISOString();
  // "Who holds a seat" is only the right question about the Congress sitting now. For any earlier one the roster is
  // closed, and the members who have since left it are part of it rather than absent from it.
  const currentOnly: boolean = congress >= getCurrentCongress();

  if (!apiKey) {
    return buildPreviewComposition(
      congress,
      retrievedAt,
      "Placeholder seats are shown until a server-only Congress.gov API key is configured.",
    );
  }

  const raw: CongressApiMember[] | null = await fetchAllMembers(apiKey, congress, currentOnly);
  const chambers: ChamberComposition[] = buildComposition(mapUsable(raw ?? [], mapCongressMember));

  if (chambers.some((chamber: ChamberComposition): boolean => chamber.members.length === 0)) {
    return buildPreviewComposition(
      congress,
      retrievedAt,
      "Live membership is temporarily unavailable, so placeholder seats are shown.",
    );
  }

  return { congress, chambers, source: "live", retrievedAt };
}
