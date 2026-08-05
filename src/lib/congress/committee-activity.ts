import {
  type CongressApiCommitteeBill,
  type CongressApiCommitteeBillsResponse,
  type CongressApiCommitteeNominationsResponse,
  type CongressApiCommitteeReportsResponse,
  type CongressApiDetailResponse,
  congressApiCommitteeBillsResponseSchema,
  congressApiCommitteeNominationsResponseSchema,
  congressApiCommitteeReportsResponseSchema,
  congressApiDetailResponseSchema,
} from "@/lib/congress/api-schema";
import {
  COMMITTEE_RECORDS_PAGE_SIZE,
  type CommitteeBillReferral,
  type CommitteeRecordKind,
  type CommitteeRecords,
  type CommitteeRecordsQuery,
  type CommitteeRecordsResult,
  clampCommitteeRecordsPage,
  committeeRecordsOffset,
  committeeRecordsPageCount,
} from "@/lib/congress/committee-records";
import type { CommitteeChamber } from "@/lib/congress/committees";
import { previewCommitteeRecords } from "@/lib/congress/fixtures";
import {
  billCacheTags,
  buildCongressUrl,
  type CongressRequestResult,
  committeeCacheTags,
  getCongressApiKey,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  normalizeCommitteeChamberSegment,
  normalizeSystemCode,
  requestCongressJson,
} from "@/lib/congress/http";
import {
  mapCommitteeBillReferral,
  mapCommitteeNomination,
  mapCommitteeReport,
  mapCongressBill,
  mapUsable,
} from "@/lib/congress/mappers";
import type { LegislativeBill } from "@/lib/congress/types";

/**
 * One page of the records a committee has accumulated — the bills referred to it, the reports it published, and the
 * nominations sent to it.
 *
 * The I/O half of the pair whose model and URL rules live in `committee-records.ts`, on exactly the split
 * `committee-directory.ts`/`committee-filter.ts` already draws. It holds the adapter's two standing invariants: nothing
 * throws, and provenance travels with the data.
 *
 * These are three separate Congress.gov endpoints with three separate response shapes — `/bills` nests its array under
 * a hyphenated `committee-bills` key, the other two return theirs at the top level — so the three fetchers below are
 * three functions rather than one parameterized over a path. What they *do* share is stated once: the paging
 * arithmetic, the "a 404 is an empty collection and a failure is not" policy, and the cache tags.
 */

/**
 * What one collection's request produced, before the paging arithmetic is applied to it.
 *
 * `records` is populated on every outcome, including failure — which is what lets {@link getCommitteeRecords} stay free
 * of a "build an empty page of the right kind" helper. Constructing that outside the branch where `kind` has been
 * narrowed to a literal costs either a cast or a three-way switch with three identical bodies, and both are worse than
 * simply letting each branch return the empty page it already knows the shape of.
 */
type FetchedRecords = {
  records: CommitteeRecords;
  total: number | undefined;
  /** The request failed outright — distinct from a 404, which is an empty collection honestly reported. */
  failed: boolean;
};

/**
 * Fetches one page of one of a committee's record collections.
 *
 * Both route params are untrusted — they arrive from the URL bar — so both are narrowed before either reaches an
 * outbound path, exactly as `getCommitteeProfile` narrows them. @see normalizeCommitteeChamberSegment and
 * normalizeSystemCode.
 *
 * @param rawChamber - The raw `chamber` route param.
 * @param rawSystemCode - The raw `systemCode` route param.
 * @param query - Which collection to read and how far into it, already parsed from the query string.
 * @param total - The committee's own count for this collection, from its profile. Used to hold a requested page inside
 *   the collection that exists *before* an offset is sent upstream, which is the only point at which that is knowable —
 *   the response can say a page overshot, but only after the round trip that proved it.
 * @returns The page, never throwing. A missing key or a malformed param resolves against the preview fixtures; a failed
 *   request resolves to an empty page flagged `unavailable`.
 */
export async function getCommitteeRecords(
  rawChamber: string,
  rawSystemCode: string,
  query: CommitteeRecordsQuery,
  total: number | undefined,
): Promise<CommitteeRecordsResult> {
  const apiKey: string | undefined = getCongressApiKey();
  const chamber: CommitteeChamber | null = normalizeCommitteeChamberSegment(rawChamber);
  const systemCode: string | null = normalizeSystemCode(rawSystemCode);

  if (!apiKey || chamber === null || systemCode === null) {
    return previewCommitteeRecords(rawSystemCode, query);
  }

  const page: number = clampCommitteeRecordsPage(query.page, total);
  const params: Record<string, string> = {
    limit: String(COMMITTEE_RECORDS_PAGE_SIZE),
    offset: String(committeeRecordsOffset(page)),
  };

  const fetched: FetchedRecords = await fetchRecords(chamber, systemCode, apiKey, query.kind, params);

  // The collection's own count is authoritative for it in a way the profile's summary figure is only assumed to be.
  // Prefer it, and fall back to what the profile said when the request failed and there is no better answer.
  const resolvedTotal: number | undefined = fetched.total ?? total;

  return {
    records: fetched.records,
    page,
    pageCount: committeeRecordsPageCount(resolvedTotal),
    total: resolvedTotal,
    unavailable: fetched.failed,
  };
}

/**
 * Requests one collection and maps it.
 *
 * @param chamber - The validated chamber segment.
 * @param systemCode - The validated system code.
 * @param apiKey - The server-only Congress.gov key.
 * @param kind - Which collection to read.
 * @param params - The `limit` and `offset` for this page.
 * @returns The mapped page and the collection's count. A 404 is *not* a failure: a committee that has never received a
 *   nomination has no nominations resource, and an empty list is the true answer rather than an unreported one.
 */
async function fetchRecords(
  chamber: CommitteeChamber,
  systemCode: string,
  apiKey: string,
  kind: CommitteeRecordKind,
  params: Record<string, string>,
): Promise<FetchedRecords> {
  const url: URL = buildCongressUrl(`/committee/${chamber}/${systemCode}/${kind}`, apiKey, params);
  const tags: string[] = committeeCacheTags(systemCode);
  const context: string = `committee ${kind} for ${systemCode}`;

  if (kind === "reports") {
    const result: CongressRequestResult<CongressApiCommitteeReportsResponse> = await requestCongressJson(
      url,
      tags,
      congressApiCommitteeReportsResponseSchema,
      context,
    );
    if (result.outcome !== "ok") {
      return { records: { kind, items: [] }, total: undefined, failed: result.outcome === "failed" };
    }

    return {
      records: { kind, items: mapUsable(result.data.reports, mapCommitteeReport) },
      total: result.data.pagination?.count,
      failed: false,
    };
  }

  if (kind === "nominations") {
    const result: CongressRequestResult<CongressApiCommitteeNominationsResponse> = await requestCongressJson(
      url,
      tags,
      congressApiCommitteeNominationsResponseSchema,
      context,
    );
    if (result.outcome !== "ok") {
      return { records: { kind, items: [] }, total: undefined, failed: result.outcome === "failed" };
    }

    return {
      records: { kind, items: mapUsable(result.data.nominations, mapCommitteeNomination) },
      total: result.data.pagination?.count,
      failed: false,
    };
  }

  const result: CongressRequestResult<CongressApiCommitteeBillsResponse> = await requestCongressJson(
    url,
    tags,
    congressApiCommitteeBillsResponseSchema,
    context,
  );
  if (result.outcome !== "ok") {
    return { records: { kind, items: [] }, total: undefined, failed: result.outcome === "failed" };
  }

  const collection: { bills?: CongressApiCommitteeBill[]; count?: number } | undefined = result.data["committee-bills"];
  const referrals: CommitteeBillReferral[] = mapUsable(collection?.bills, mapCommitteeBillReferral);

  return {
    records: { kind, items: await withBillTitles(referrals, apiKey) },
    total: result.data.pagination?.count ?? collection?.count,
    failed: false,
  };
}

/**
 * Fills in the titles the committee-bills endpoint doesn't send.
 *
 * **This is the one place in the adapter where rendering a page costs more than a bounded handful of upstream
 * requests, and it is a deliberate trade rather than an oversight.** The committee-bills endpoint publishes a congress,
 * a type, a number, a relationship, and a date — and no title. A list reading "H.R. 10000 · Referred To · July 30,
 * 2026" tells a reader which measures a committee handled and nothing whatsoever about what they were, which for a
 * product whose stated purpose is making the legislative process legible is close to no feature at all. The titles are
 * the feature.
 *
 * What keeps the cost bounded and honest:
 *
 * - **One request per row on screen, never per record in the collection.** The cap is
 *   {@link COMMITTEE_RECORDS_PAGE_SIZE}, so a committee with ten thousand referrals costs exactly what one with twelve
 *   does.
 * - **They go out together**, so the page waits on the slowest single lookup rather than the sum of twelve.
 * - **Every one of them is cached on the bill's own tags** for the app's standard five minutes, and shares those tags
 *   with the bill's own page — so a reader who follows one of these rows pays nothing to open it.
 * - **A failed lookup costs the title and nothing else.** The row still names the measure, still says what the
 *   committee did with it, and still links to the bill's page. Dropping the row instead would quietly shorten a list
 *   whose length is printed directly above it.
 *
 * @param referrals - The mapped referrals for one page.
 * @param apiKey - The server-only Congress.gov key.
 * @returns The same referrals in the same order, each carrying its bill record where the lookup succeeded.
 */
async function withBillTitles(referrals: CommitteeBillReferral[], apiKey: string): Promise<CommitteeBillReferral[]> {
  return Promise.all(
    referrals.map(async (referral: CommitteeBillReferral): Promise<CommitteeBillReferral> => {
      const bill: LegislativeBill | undefined = await lookUpBill(referral, apiKey);

      return bill ? { ...referral, bill } : referral;
    }),
  );
}

/**
 * Looks up one referred measure's own record.
 *
 * The identifier is re-validated through {@link normalizeBillRouteParams} even though it came from Congress.gov rather
 * than from a reader, on the adapter's standing rule that *every* dynamic path segment is proven to match a closed
 * format before it is interpolated into an outbound URL. The rule is about the URL being built, not about who is
 * believed to have supplied the value.
 *
 * @param referral - The referral whose measure to look up.
 * @param apiKey - The server-only Congress.gov key.
 * @returns The bill, or `undefined` for a malformed identifier, a 404, a failure, or a record that didn't survive
 *   mapping. Every one of those means the same thing to the caller — no title — so they are not distinguished.
 */
async function lookUpBill(referral: CommitteeBillReferral, apiKey: string): Promise<LegislativeBill | undefined> {
  const route: NormalizedBillRoute | null = normalizeBillRouteParams({
    congress: String(referral.congress),
    type: referral.type,
    number: referral.number,
  });
  if (route === null) return undefined;

  const result: CongressRequestResult<CongressApiDetailResponse> = await requestCongressJson(
    buildCongressUrl(`/bill/${route.congress}/${route.type}/${route.number}`, apiKey),
    billCacheTags(route),
    congressApiDetailResponseSchema,
    `referred bill ${route.congress}-${route.type}-${route.number}`,
  );

  if (result.outcome !== "ok" || !result.data.bill) return undefined;

  return mapCongressBill(result.data.bill) ?? undefined;
}
