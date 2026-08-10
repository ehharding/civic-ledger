import type { BillRouteParams, RelatedBill } from "@/lib/congress/bills/model";
import { fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiRelatedBill,
  type CongressApiRelatedBillsResponse,
  congressApiRelatedBillsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { mapRelatedBill } from "@/lib/congress/upstream/mappers";

/**
 * The other measures a bill is recorded as related to.
 *
 * This is the read that keeps a bill page from being an island. The single most common question a reader arrives with
 * after finding a House bill — "is there a Senate version of this?" — has an answer on the record, and this is what
 * turns that answer into a link rather than a number to guess at.
 *
 * **Every relationship here is attributed, and that is the point rather than a nicety.** Two bills being "related" is
 * an editorial judgment, not a legislative act: the Congressional Research Service identifies its own, and so do the
 * House and the Senate, and they do not always agree. The endpoint names who made each call in `identifiedBy`, so the
 * page prints the attribution beside the relationship instead of presenting relatedness as a property the measures
 * simply have. That is the same standard this app applies to its own stage cue, turned on a claim it received rather
 * than one it made. @see RelatedBillRelationship
 *
 * **The publisher's order is kept, and is not claimed to mean anything.** Congress.gov documents no ordering for this
 * collection and ignores its own `sort` parameter here, exactly as on the committee-records endpoints — so `dateKey` is
 * omitted and the page's copy says the list is in Congress.gov's own order rather than implying either end is the most
 * significant or the most recent.
 *
 * Holds the adapter's two standing invariants: it never throws, and an empty array is rendered as "none on the record",
 * which is both the failure state and the ordinary state of most bills. The bill's own record publishes the count, so a
 * page that fetched nothing beside a published figure of thirty-eight states the gap rather than claiming the record is
 * empty. @see BillCollectionCounts
 *
 * @see sub-resource.ts for the transport, guard, and caching policy this shares with `/summaries` and `/text`.
 */

/**
 * Fetches every measure Congress.gov records as related to this bill.
 *
 * @param input - The bill's route params.
 * @returns The related measures in the publisher's own order. Always empty in preview mode, on a 404, and on failure.
 */
export async function getRelatedBills(input: BillRouteParams): Promise<RelatedBill[]> {
  return fetchBillSubResource(input, {
    path: "relatedbills",
    schema: congressApiRelatedBillsResponseSchema,
    select: (payload: CongressApiRelatedBillsResponse): CongressApiRelatedBill[] | undefined => payload.relatedBills,
    map: mapRelatedBill,
  });
}
