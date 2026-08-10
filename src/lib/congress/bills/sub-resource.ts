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
 * Fetches one of a bill's sub-resources and maps it into the app's model.
 *
 * @typeParam Payload - The validated response shape for this sub-resource.
 * @typeParam Raw - One unmapped entry from that payload.
 * @typeParam Entry - The app's mapped entry type.
 * @param input - The bill's route params.
 * @param config - The sub-resource's path suffix, schema, the collection to read off the payload, its entry mapper, and
 *   optionally the date field to order by. Omitting `dateKey` keeps the publisher's own order, which is the right
 *   choice wherever that order carries meaning this app did not establish and could not restate.
 * @returns The mapped entries. Always an empty array when no key is configured, on a 404, or on failure — every caller
 *   renders that as "nothing published yet", which is also a real and common state for a newly introduced bill.
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
): Promise<Entry[]> {
  const apiKey: string | undefined = getCongressApiKey();
  if (!apiKey) return [];

  const route: NormalizedBillRoute | null = normalizeBillRouteParams(input);
  if (!route) return [];

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

  if (result.outcome !== "ok") return [];

  const entries: Entry[] = mapUsable(config.select(result.data), config.map);

  return config.dateKey === undefined ? entries : sortByDateDesc(entries, config.dateKey);
}
