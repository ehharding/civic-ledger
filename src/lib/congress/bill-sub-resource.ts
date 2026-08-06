import type { ZodType } from "zod";

import {
  billCacheTags,
  buildCongressUrl,
  type CongressRequestResult,
  getCongressApiKey,
  MAX_API_PAGE_SIZE,
  type NormalizedBillRoute,
  normalizeBillRouteParams,
  requestCongressJson,
} from "@/lib/congress/http";
import { mapUsable, sortByDateDesc } from "@/lib/congress/mappers";
import type { BillRouteParams } from "@/lib/congress/types";

/**
 * The one read shared by every collection hanging off a single bill — `/summaries`, `/text`, `/actions`, `/committees`.
 *
 * These four differ in their path segment, their payload schema, the collection to read off it, the mapper applied to
 * each entry, and whether they are ordered by date. Everything they have in common is stated here once: the key check,
 * the route-param guard, the page-size ceiling, the cache tags, and the rule that an absent record is an empty list
 * rather than an error.
 *
 * It lives in its own module rather than inside `bills.ts` because `bill-committees.ts` needs it too, and a module
 * whose exports are otherwise all public reads is the wrong place to keep an internal helper two modules share.
 */

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
    path: "summaries" | "text" | "actions" | "committees";
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
