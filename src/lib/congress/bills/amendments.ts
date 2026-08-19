import type { BillAmendment, BillRouteParams } from "@/lib/congress/bills/model";
import { type BillSubResource, fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiBillAmendment,
  type CongressApiBillAmendmentsResponse,
  congressApiBillAmendmentsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { mapBillAmendment } from "@/lib/congress/upstream/mappers";

/**
 * The amendments offered to a bill.
 *
 * This is the read that closes the gap the lifecycle lesson names in its own limits list: the two chambers rarely pass
 * identical text on the first try, and everything they traded to get there happens inside the single step labeled
 * "Passed a Chamber". The action history already shows the *votes* on those amendments in Congress's own prose. What it
 * cannot do is name the amendments themselves as records a reader can open, which is what this collection is for.
 *
 * **The list is mostly citations, and the section built on it says so.** Roughly one entry in fifteen carries a purpose
 * or a latest action; the rest carry identity and nothing else. @see congressApiBillAmendmentSchema for the measurement
 * and {@link mapBillAmendment} for why an identity-only entry is kept rather than dropped. The honest framing is that
 * this names every amendment offered and links each one, not that it describes them — a section written the other way
 * around would read as broken on precisely the bills it matters most on.
 *
 * **The publisher's order is kept, and is not claimed to mean anything.** `dateKey` is omitted for the same reason
 * `related.ts` omits it: the only date on an entry is `updateDate`, which records when Congress.gov last touched the
 * row rather than when anything happened to the amendment, and sorting by it would present a maintenance timestamp as
 * chronology. The section's copy says the order is Congress.gov's own.
 *
 * Holds the adapter's two standing invariants: it never throws, and an unanswered request is reported as one rather
 * than as an empty collection. "No amendment was offered to this bill" is the ordinary state of most bills and it is
 * also, worded that way, a claim — so a request that failed does not get to make it. @see BillSubResource.
 *
 * @see sub-resource.ts for the transport, guard, and caching policy this shares with the other six collections.
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
