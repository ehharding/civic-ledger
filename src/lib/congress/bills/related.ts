import type { BillRouteParams, BillSubResource, RelatedBill } from "@/lib/congress/bills/model";
import { fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiRelatedBill,
  type CongressApiRelatedBillsResponse,
  congressApiRelatedBillsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { mapRelatedBill } from "@/lib/congress/upstream/mappers";

/**
 * The other measures a bill is recorded as related to — e.g., its Senate companion.
 *
 * Every relationship is attributed (`identifiedBy`: CRS, the House, or the Senate), since relatedness is an editorial
 * judgment. The publisher's order is kept and not claimed to mean anything: it's undocumented and `sort` is ignored.
 *
 * Never throws, and a failed request is reported as unanswered rather than as "nothing related".
 *
 * @see BillSubResource, BillCollectionCounts, and sub-resource.ts for the shared transport and caching.
 */

/**
 * Fetches every measure Congress.gov records as related to this bill.
 *
 * @param input - The bill's route params.
 * @returns The related measures in the publisher's own order. Empty and answered in preview mode and on a 404; empty
 *   and flagged unavailable on failure.
 */
export async function getRelatedBills(input: BillRouteParams): Promise<BillSubResource<RelatedBill>> {
  return fetchBillSubResource(input, {
    path: "relatedbills",
    schema: congressApiRelatedBillsResponseSchema,
    select: (payload: CongressApiRelatedBillsResponse): CongressApiRelatedBill[] | undefined => payload.relatedBills,
    map: mapRelatedBill,
  });
}
