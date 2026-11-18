import type { BillAmendment, BillRouteParams, BillSubResource } from "@/lib/congress/bills/model";
import { fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiBillAmendment,
  type CongressApiBillAmendmentsResponse,
  congressApiBillAmendmentsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { mapBillAmendment } from "@/lib/congress/upstream/mappers";

/**
 * The amendments offered to a bill, as openable records. Mostly citations: roughly one in fifteen carries a purpose
 * (see {@link congressApiBillAmendmentSchema} and {@link mapBillAmendment}), and the section says so.
 *
 * The publisher's order is kept — the only date is `updateDate`, a maintenance timestamp, so `dateKey` is omitted.
 *
 * Never throws, and a failed request is reported as unanswered rather than as "no amendments".
 *
 * @see BillSubResource and sub-resource.ts for the shared transport and caching.
 */

/**
 * Fetches every amendment Congress.gov records against this bill.
 *
 * @param input - The bill's route params.
 * @returns The amendments in the publisher's own order, capped at the single 250-record page the transport
 *   requests — which is a real cap here rather than a theoretical one, since a reconciliation bill can draw several
 *   hundred. The page states both figures against the published count. Empty and answered in preview mode and on a 404;
 *   empty and flagged unavailable on failure.
 */
export async function getBillAmendments(input: BillRouteParams): Promise<BillSubResource<BillAmendment>> {
  return fetchBillSubResource(input, {
    path: "amendments",
    schema: congressApiBillAmendmentsResponseSchema,
    select: (payload: CongressApiBillAmendmentsResponse): CongressApiBillAmendment[] | undefined => payload.amendments,
    map: mapBillAmendment,
  });
}
