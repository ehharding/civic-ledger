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
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  requestCongressJson,
} from "@/lib/congress/upstream/http";
import { mapCongressCommittee, mapUsable } from "@/lib/congress/upstream/mappers";
import { formatOrdinal } from "@/lib/format";

/**
 * The committees of one Congress, as the browsable directory at `/committees` reads them.
 *
 * Structurally the closest sibling to `members/composition.ts` — a paginated list endpoint, flattened into one
 * alphabetical roster — and it follows the adapter's two standing invariants for the same reasons: nothing throws, and
 * provenance travels with the data.
 *
 * @see profile.ts for the individual committee page's separate, item-level read.
 */

/**
 * Hard ceiling on committee pages fetched for one Congress.
 *
 * A Congress has on the order of 250 committee records once subcommittees are counted, so two pages of {@link
 * MAX_API_PAGE_SIZE} covers it with room to spare. The cap exists for the same reason `MAX_MEMBER_PAGES` does: a
 * malformed `pagination.count` should not be able to turn one page render into an unbounded fetch loop.
 */
const MAX_COMMITTEE_PAGES: number = 3;

/** What {@link getCommitteeDirectory} resolved: the committees, the Congress they belong to, and where they came from. */
export type CommitteeDirectoryResult = {
  /** The Congress this list describes, echoed back so the page can name it without recomputing it. */
  congress: number;
  /** Every listable parent committee, alphabetically. @see buildCommitteeDirectory for what "parent" excludes. */
  committees: CommitteeSummary[];
  source: CongressSnapshot["source"];
  retrievedAt: string;
  /** User-facing explanation shown when `source` is "preview". */
  notice?: string;
};

/**
 * Flattens a fetched committee list into directory rows.
 *
 * Exported for its own tests: the subcommittee rule below is the substance of this module, and it is worth being able
 * to assert on directly rather than only through a stubbed fetch.
 *
 * Subcommittees are **dropped here, not hidden**. Congress.gov's list endpoint returns them as siblings of their
 * parents — the House Agriculture Committee and its six subcommittees arrive as seven peer records — and rendering that
 * flat would put "Livestock and Foreign Agriculture Subcommittee" in the same alphabetical run as the Judiciary
 * Committee, as though the two were comparable bodies. They are not: a subcommittee only means anything in relation to
 * its parent, which is exactly where this app shows it. Nothing becomes unreachable — every parent's page lists its
 * subcommittees, each linking to a page of its own — and each card carries the count, so the directory says how much is
 * one level down rather than silently flattening it away.
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

/**
 * Fetches one page of the committee list for a Congress.
 *
 * @param input - The API key, the Congress to read, and the page offset.
 * @returns The validated page, or `null` on any failure — so the caller can decide whether a partial result is still
 *   worth rendering.
 */
async function fetchCommitteePage(input: {
  apiKey: string;
  congress: number;
  offset: number;
}): Promise<CongressApiCommitteeListResponse | null> {
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
 * Fetches every committee of a Congress, across as many pages as it takes.
 *
 * Paginated exactly as the member roster is: the first page goes out alone to read `pagination.count`, then the rest go
 * out together rather than one after another.
 *
 * @param apiKey - The server-only Congress.gov key.
 * @param congress - The Congress whose committees to read.
 * @returns Every committee record found, or `null` only when the *first* page fails. A later page failing yields what
 *   did arrive — a directory missing its tail is still a usable directory, and it is labeled live either way.
 */
async function fetchAllCommittees(apiKey: string, congress: number): Promise<CongressApiCommittee[] | null> {
  const firstPage: CongressApiCommitteeListResponse | null = await fetchCommitteePage({ apiKey, congress, offset: 0 });
  if (!firstPage) return null;

  const firstCommittees: CongressApiCommittee[] = firstPage.committees ?? [];
  const total: number = firstPage.pagination?.count ?? firstCommittees.length;
  const pageCount: number = Math.min(MAX_COMMITTEE_PAGES, Math.ceil(total / MAX_API_PAGE_SIZE));

  if (pageCount <= 1) return firstCommittees;

  const laterPages: (CongressApiCommitteeListResponse | null)[] = await Promise.all(
    Array.from(
      { length: pageCount - 1 },
      (_unused: unknown, index: number): Promise<CongressApiCommitteeListResponse | null> =>
        fetchCommitteePage({ apiKey, congress, offset: (index + 1) * MAX_API_PAGE_SIZE }),
    ),
  );

  return [
    ...firstCommittees,
    ...laterPages.flatMap((page: CongressApiCommitteeListResponse | null): CongressApiCommittee[] =>
      page ? (page.committees ?? []) : [],
    ),
  ];
}

/**
 * Fetches every committee of a Congress, as a single alphabetical directory.
 *
 * The whole list is handed to the browser at once and every subsequent search or filter runs there instantly — the same
 * approach the member directory takes, and for the same reason: the list is bounded, it is already in memory once the
 * fetch resolves, and Congress.gov offers no committee-search parameter to defer to. @see members/directory.ts, which
 * explains why the bill directory can't work this way.
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

  // An empty result is treated as a failed fetch rather than rendered as an empty directory: "this Congress has no
  // committees" is never a true statement about a Congress, and a page showing it would read as one.
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
