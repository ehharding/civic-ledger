import type { ZodType } from "zod";
import type { BillRouteParams } from "@/lib/congress/bills/model";
import { type CongressApiDetailResponse, congressApiDetailResponseSchema } from "@/lib/congress/upstream/api-schema";
import {
  billCacheTags,
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  requestCongressJson,
} from "@/lib/congress/upstream/http";
import { mapUsable, sortByDateDesc } from "@/lib/congress/upstream/mappers";

/**
 * The two reads shared by every module that reaches for a *single bill*: the bill's own record, and any of the
 * collections hanging off it — `/summaries`, `/text`, `/actions`, `/committees`, `/cosponsors`, `/relatedbills`.
 *
 * Those collections differ in their path segment, their payload schema, the collection to read off it, the mapper
 * applied to each entry, and whether they are ordered by date. Everything they have in common is stated here once: the
 * key check, the route-param guard, the page-size ceiling, the cache tags, and the rule that an absent record is an
 * empty list rather than an error.
 *
 * It lives in its own module rather than inside `reads.ts` because `committees.ts`, `cosponsors.ts`, `related.ts`, and
 * `committees/activity.ts` need it too, and a module whose exports are otherwise all public reads is the wrong place to
 * keep an internal helper five modules share.
 */

/**
 * Requests one bill's own record from the detail endpoint.
 *
 * Two callers reach a single bill by identifier and they want opposite things from a failure — `getBillById` falls back
 * to a snapshot search and then to the preview fixtures, while the committee page's title lookup simply goes without a
 * title — so this deliberately hands back the raw {@link CongressRequestResult} rather than a bill. What it does own is
 * everything the two must agree on: the endpoint's path spelling, its schema, and the cache tags that let a title
 * lookup and the bill's own page share one cached response instead of paying for it twice.
 *
 * @param route - The bill's identifier, already proven safe to interpolate. @see normalizeBillRouteParams
 * @param apiKey - The server-only Congress.gov key.
 * @param context - Short label for the server-side log line, naming which of the two reads this was.
 * @returns The request's outcome, unmapped. Never throws.
 */
export function requestBillDetail(
  route: NormalizedBillRoute,
  apiKey: string,
  context: string,
): Promise<CongressRequestResult<CongressApiDetailResponse>> {
  return requestCongressJson(
    buildCongressUrl(`/bill/${route.congress}/${route.type}/${route.number}`, apiKey),
    billCacheTags(route),
    congressApiDetailResponseSchema,
    context,
  );
}

/**
 * One sub-resource collection, and whether the app actually got an answer about it.
 *
 * The two are carried together on one object for the adapter's second standing invariant — provenance travels with the
 * data — because the alternative is what this helper used to do: return a bare array and let six sections render an
 * empty one as a fact about Congress. An empty list is a claim ("no member has cosponsored this bill"); an unanswered
 * request is not, and a page that cannot tell them apart states the first whenever the second happens.
 *
 * This is the same distinction `committees/activity.ts` keeps for a committee's record collections, spelled the same
 * way — @see FetchedRecords — and for the same reason its `emptyCopy` gives failure its own sentence.
 *
 * @typeParam Entry - The app's mapped entry type for this collection.
 */
export type BillSubResource<Entry> = {
  entries: Entry[];
  /**
   * Congress.gov did not answer, so `entries` being empty says nothing about the record.
   *
   * A 404 is deliberately *not* this: a bill with no summaries yet has no summaries resource, and an empty collection
   * is the true answer rather than an unreported one. Only an outright failure — a 5xx, a timeout, a dropped
   * connection, an unparseable payload — sets this.
   */
  unavailable: boolean;
};

/**
 * An answered request that found nothing, for the paths that resolve without reaching upstream at all.
 *
 * A function rather than a shared constant because the value is generic in `Entry` and holds a mutable array; one
 * frozen instance would either have to be cast at each use or be handed out for a caller to append to.
 */
function answeredEmpty<Entry>(): BillSubResource<Entry> {
  return { entries: [], unavailable: false };
}

/**
 * Fetches one of a bill's sub-resources and maps it into the app's model.
 *
 * @typeParam Payload - The validated response shape for this sub-resource.
 * @typeParam Raw - One unmapped entry from that payload.
 * @typeParam Entry - The app's mapped entry type.
 * @param input - The bill's route params.
 * @param config - The sub-resource's path suffix, schema, the collection to read off the payload, its entry mapper, and
 *   optionally the date field to order by. Omitting `dateKey` keeps the publisher's own order, which is the right
 *   choice wherever that order carries meaning this app did not establish and could not restate.
 * @returns The mapped entries, and whether the request that should have produced them failed. Empty and *answered* when
 *   no key is configured, when the route params are malformed, and on a 404 — a caller renders those as "nothing
 *   published yet", which is a real and common state for a newly introduced bill. Empty and *unanswered* on failure,
 *   which is not that state and must not be worded as it.
 */
export async function fetchBillSubResource<Payload, Raw, Entry>(
  input: BillRouteParams,
  config: {
    path: "summaries" | "text" | "actions" | "committees" | "cosponsors" | "relatedbills";
    schema: ZodType<Payload>;
    select: (payload: Payload) => Raw[] | undefined;
    map: (entry: Raw) => Entry | null;
    dateKey?: keyof Entry;
  },
): Promise<BillSubResource<Entry>> {
  const apiKey: string | undefined = getCongressApiKey();
  if (!apiKey) return answeredEmpty();

  const route: NormalizedBillRoute | null = normalizeBillRouteParams(input);
  if (!route) return answeredEmpty();

  // The max page size, requested explicitly so a single call covers the rare bill with more than the default 20.
  const url: URL = buildCongressUrl(`/bill/${route.congress}/${route.type}/${route.number}/${config.path}`, apiKey, {
    limit: String(MAX_API_PAGE_SIZE),
  });

  const result: CongressRequestResult<Payload> = await requestCongressJson(
    url,
    billCacheTags(route),
    config.schema,
    `bill ${config.path} for ${route.type.toUpperCase()} ${route.number}`,
  );

  if (result.outcome !== "ok") return { entries: [], unavailable: result.outcome === "failed" };

  const entries: Entry[] = mapUsable(config.select(result.data), config.map);

  return {
    entries: config.dateKey === undefined ? entries : sortByDateDesc(entries, config.dateKey),
    unavailable: false,
  };
}
