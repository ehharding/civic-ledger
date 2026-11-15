import type { BillRouteParams } from "@/lib/congress/bills/model";
import { type BillSubResource, fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import type { BillCommittee } from "@/lib/congress/committees/model";
import {
  type CongressApiBillCommittee,
  type CongressApiBillCommitteesResponse,
  congressApiBillCommitteesResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { mapBillCommittee } from "@/lib/congress/upstream/mappers";

/**
 * Which committees held a bill, and what each did with it — one request, arriving with the names, chambers, and system
 * codes an inward link needs (rather than parsing committee names out of action prose).
 *
 * Never throws, and a failed request is reported as unanswered rather than as "no referrals".
 *
 * @see BillSubResource and sub-resource.ts for the shared transport and caching.
 */

/**
 * Fetches every committee a bill was referred to, reported by, or otherwise handled by.
 *
 * @param input - The bill's route params.
 * @returns The committees in Congress.gov's own order — primary committee first, which is meaningful and which this app
 *   therefore does not re-sort. Empty and answered in preview mode and on a 404; empty and flagged unavailable on
 *   failure.
 */
export async function getBillCommittees(input: BillRouteParams): Promise<BillSubResource<BillCommittee>> {
  return fetchBillSubResource(input, {
    path: "committees",
    schema: congressApiBillCommitteesResponseSchema,
    select: (payload: CongressApiBillCommitteesResponse): CongressApiBillCommittee[] | undefined => payload.committees,
    map: mapBillCommittee,
  });
}
