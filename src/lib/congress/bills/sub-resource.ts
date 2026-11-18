import type { ZodType } from "zod";

import type { BillRouteParams, BillSubResource } from "@/lib/congress/bills/model";
import { type CongressApiDetailResponse, congressApiDetailResponseSchema } from "@/lib/congress/upstream/api-schema";
import {
  billCacheTags,
  billPageCacheWindow,
  buildCongressUrl,
  type CacheWindow,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  requestCongressJson,
  revalidateSecondsForCongress,
} from "@/lib/congress/upstream/http";
import { mapUsable, sortByDateDesc } from "@/lib/congress/upstream/mappers";

/**
 * The two reads shared by every module that reaches for a *single bill*: the bill's own record, and any of the
 * collections hanging off it — `/summaries`, `/text`, `/actions`, `/committees`, `/cosponsors`, `/relatedbills`,
 * `/amendments`.
 *
 * Those collections differ in their path segment, their payload schema, the collection to read off it, the mapper
 * applied to each entry, and whether they are ordered by date. Everything they have in common is stated here once: the
 * key check, the route-param guard, the page-size ceiling, the cache tags, and the rule that an absent record is an
 * empty list rather than an error.
 *
 * Its own module, not part of `reads.ts`, because four other modules share it and `reads.ts` exports only public reads.
 */

/**
 * The upstream path of one bill's own record, which each of its sub-resources hangs off.
 *
 * @param route - The bill's identifier, already proven safe to interpolate.
 * @returns e.g., `"/bill/119/hr/284"`.
 */
function billPath(route: NormalizedBillRoute): string {
  return `/bill/${route.congress}/${route.type}/${route.number}`;
}

/**
 * Requests one bill's own record from the detail endpoint.
 *
 * Two callers reach a single bill by identifier and they want opposite things from a failure — `getBillById` falls back
 * to the preview fixtures and flags itself unavailable, while the committee page's title lookup simply goes without a
 * title — so this deliberately hands back the raw {@link CongressRequestResult} rather than a bill. What it does own is
 * everything the two must agree on: the endpoint's path spelling, its schema, and the cache tags that let a title
 * lookup and the bill's own page share one cached response instead of paying for it twice.
 *
 * @param route - The bill's identifier, already proven safe to interpolate.
 * @param apiKey - The server-only Congress.gov key.
 * @param context - Short label for the server-side log line, naming which of the two reads this was.
 * @param revalidate - The cache window. Defaults to the Congress-scoped one, which the committee page's title lookup
 *   wants: it reads many bills it never renders a page for. The bill page passes {@link billPageCacheWindow}, since its
 *   own ISR entry already holds the response.
 * @returns The request's outcome, unmapped. Never throws.
 * @see normalizeBillRouteParams
 */
export function requestBillDetail(
  route: NormalizedBillRoute,
  apiKey: string,
  context: string,
  revalidate: CacheWindow = revalidateSecondsForCongress(route.congress),
): Promise<CongressRequestResult<CongressApiDetailResponse>> {
  return requestCongressJson(
    buildCongressUrl(billPath(route), apiKey),
    billCacheTags(route),
    congressApiDetailResponseSchema,
    context,
    revalidate,
  );
}

/**
 * An answered request that found nothing, for the paths that resolve without reaching upstream at all.
 *
 * A function rather than a shared constant because the value is generic in `Entry` and holds a mutable array; one
 * frozen instance would either have to be cast at each use or be handed out for a caller to append to.
 *
 * @typeParam Entry - The collection's entry type.
 * @returns An empty, answered collection.
 */
function answeredEmpty<Entry>(): BillSubResource<Entry> {
  return { entries: [], unavailable: false };
}

/**
 * How to fetch and map one of a bill's sub-resources.
 *
 * @typeParam Payload - The validated response shape for this sub-resource.
 * @typeParam Raw - One unmapped entry from that payload.
 * @typeParam Entry - The app's mapped entry type.
 */
type BillSubResourceConfig<Payload, Raw, Entry> = {
  /** The sub-resource's path suffix. */
  path: "summaries" | "text" | "actions" | "committees" | "cosponsors" | "relatedbills" | "amendments";
  /** The Zod schema for its response. */
  schema: ZodType<Payload>;
  /** Reads the collection off the payload. */
  select: (payload: Payload) => Raw[] | undefined;
  /** Maps one entry, or returns `null` for an unusable one. */
  map: (entry: Raw) => Entry | null;
  /**
   * The date field to order by, newest first. Omitting it keeps the publisher's own order, which is the right choice
   * wherever that order carries meaning this app did not establish and could not restate.
   */
  dateKey?: keyof Entry;
};

/**
 * Fetches one of a bill's sub-resources and maps it into the app's model.
 *
 * @typeParam Payload - The validated response shape for this sub-resource.
 * @typeParam Raw - One unmapped entry from that payload.
 * @typeParam Entry - The app's mapped entry type.
 * @param input - The bill's route params.
 * @param config - {@link BillSubResourceConfig}.
 * @returns The mapped entries, and whether the request that should have produced them failed. Empty and *answered* when
 *   no key is configured, when the route params are malformed, and on a 404 — a caller renders those as "nothing
 *   published yet", which is a real and common state for a newly introduced bill. Empty and *unanswered* on failure,
 *   which is not that state and must not be worded as it.
 */
export async function fetchBillSubResource<Payload, Raw, Entry>(
  input: BillRouteParams,
  config: BillSubResourceConfig<Payload, Raw, Entry>,
): Promise<BillSubResource<Entry>> {
  const apiKey: string | undefined = getCongressApiKey();
  if (!apiKey) return answeredEmpty();

  const route: NormalizedBillRoute | null = normalizeBillRouteParams(input);
  if (!route) return answeredEmpty();

  // The max page size, requested explicitly so a single call covers the rare bill with more than the default 20.
  const url: URL = buildCongressUrl(`${billPath(route)}/${config.path}`, apiKey, {
    limit: String(MAX_API_PAGE_SIZE),
  });

  const result: CongressRequestResult<Payload> = await requestCongressJson(
    url,
    billCacheTags(route),
    config.schema,
    `bill ${config.path} for ${route.type.toUpperCase()} ${route.number}`,
    // Every collection here is read only by the bill's own page, whose ISR entry is the cache. See billPageCacheWindow
    billPageCacheWindow(route.congress),
  );

  if (result.outcome !== "ok") return { entries: [], unavailable: result.outcome === "failed" };

  const entries: Entry[] = mapUsable(config.select(result.data), config.map);

  return {
    entries: config.dateKey === undefined ? entries : sortByDateDesc(entries, config.dateKey),
    unavailable: false,
  };
}
