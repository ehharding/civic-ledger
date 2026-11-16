import type { CongressSnapshot } from "@/lib/congress/bills/model";
import { type CommitteeSummary, compareCommitteesByName } from "@/lib/congress/committees/model";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import {
  type CongressApiCommittee,
  type CongressApiCommitteeListResponse,
  congressApiCommitteeListResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { previewCommitteeDirectory } from "@/lib/congress/upstream/fixtures";
import {
  buildCongressUrl,
  COMMITTEE_LIST_CACHE_TAG,
  type CongressRequestResult,
  fetchAllPages,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  requestCongressJson,
} from "@/lib/congress/upstream/http";
import { mapCongressCommittee, mapUsable } from "@/lib/congress/upstream/mappers";
import { formatOrdinal } from "@/lib/format";

/**
 * The committees of one Congress, as `/committees` reads them: a paginated list flattened into one alphabetical roster.
 * Like every adapter read, nothing throws and provenance travels with the data.
 *
 * @see profile.ts for the item-level read.
 */

/**
 * Hard ceiling on committee pages fetched for one Congress (~250 records with subcommittees), so a malformed
 * `pagination.count` can't cause an unbounded fetch loop.
 */
const MAX_COMMITTEE_PAGES: number = 3;

/**
 * What {@link getCommitteeDirectory} resolved: the committees, the Congress they belong to, and where they came from.
 */
export type CommitteeDirectoryResult = {
  /** The Congress this list describes, echoed back so the page can name it without recomputing it. */
  congress: number;
  /**
   * Every listable parent committee, alphabetically.
   *
   * @see buildCommitteeDirectory for what "parent" excludes.
   */
  committees: CommitteeSummary[];
  /** Whether these are live records or labeled placeholders. */
  source: CongressSnapshot["source"];
  /** When the read happened, as an ISO timestamp. */
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
};

/**
 * Flattens a fetched committee list into directory rows. Exported for its tests.
 *
 * Congress.gov lists subcommittees as peers of their parents; they're dropped here, since a subcommittee only means
 * something relative to its parent. Each parent's page lists them, and each card carries their count.
 *
 * @param committees - Raw committee records from the list endpoint.
 * @returns One row per parent committee, alphabetically. A record that can't be mapped (no code, no name, no
 *   recognizable chamber) is dropped rather than rendered as an unopenable card.
 */
export function buildCommitteeDirectory(committees: CongressApiCommittee[]): CommitteeSummary[] {
  return mapUsable(committees, mapCongressCommittee)
    .filter((committee: CommitteeSummary): boolean => committee.parent === undefined)
    .sort(compareCommitteesByName);
}

/** One request for a page of the committee list. */
type CommitteePageRequest = {
  /** The server-only Congress.gov key. */
  apiKey: string;
  /** The Congress to read. */
  congress: number;
  /** The page offset. */
  offset: number;
};

/**
 * Fetches one page of the committee list for a Congress.
 *
 * @param input - {@link CommitteePageRequest}.
 * @returns The validated page, or `null` on any failure — so the caller can decide whether a partial result is still
 *   worth rendering.
 */
async function fetchCommitteePage(input: CommitteePageRequest): Promise<CongressApiCommitteeListResponse | null> {
  const url: URL = buildCongressUrl(`/committee/${input.congress}`, input.apiKey, {
    limit: String(MAX_API_PAGE_SIZE),
    offset: String(input.offset),
  });

  const result: CongressRequestResult<CongressApiCommitteeListResponse> = await requestCongressJson(
    url,
    [COMMITTEE_LIST_CACHE_TAG],
    congressApiCommitteeListResponseSchema,
    `committee page at offset ${input.offset} for the ${formatOrdinal(input.congress)} Congress`,
  );

  return result.outcome === "ok" ? result.data : null;
}

/**
 * Fetches every committee of a Congress, across as many pages as it takes — paginated exactly as the member roster is.
 *
 * @param apiKey - The server-only Congress.gov key.
 * @param congress - The Congress whose committees to read.
 * @returns Every committee record found, or `null` only when the *first* page fails. A directory missing its tail is
 *   still a usable directory, and it is labeled live either way.
 * @see fetchAllPages
 */
function fetchAllCommittees(apiKey: string, congress: number): Promise<CongressApiCommittee[] | null> {
  return fetchAllPages(
    (offset: number): Promise<CongressApiCommitteeListResponse | null> =>
      fetchCommitteePage({ apiKey, congress, offset }),
    (page: CongressApiCommitteeListResponse): CongressApiCommittee[] | undefined => page.committees,
    MAX_COMMITTEE_PAGES,
  );
}

/**
 * Fetches every committee of a Congress as one alphabetical directory, filtered in the browser — the list is bounded
 * and Congress.gov has no committee search.
 *
 * @param congress - The Congress whose committees to read. Defaults to the one currently seated.
 * @returns The directory, always labeled live or preview. A missing key or a failed request yields the labeled
 *   placeholder committees rather than an empty page; this never throws.
 */
export async function getCommitteeDirectory(
  congress: number = getCurrentCongress(),
): Promise<CommitteeDirectoryResult> {
  const apiKey: string | undefined = getCongressApiKey();
  const retrievedAt: string = new Date().toISOString();

  if (!apiKey) {
    return {
      congress,
      committees: previewCommitteeDirectory(),
      source: "preview",
      retrievedAt,
      notice:
        "These are illustrative placeholder committees, not the committees of any real Congress. Configure a " +
        "server-only Congress.gov API key to browse the real ones.",
    };
  }

  const raw: CongressApiCommittee[] | null = await fetchAllCommittees(apiKey, congress);
  const committees: CommitteeSummary[] = buildCommitteeDirectory(raw ?? []);

  // Empty means the fetch failed: no Congress has zero committees.
  if (committees.length === 0) {
    return {
      congress,
      committees: previewCommitteeDirectory(),
      source: "preview",
      retrievedAt,
      notice: "Live committee records are temporarily unavailable, so placeholder committees are shown.",
    };
  }

  return { congress, committees, source: "live", retrievedAt };
}
