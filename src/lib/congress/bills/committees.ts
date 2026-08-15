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
 * Which committees held a bill, and what each of them did with it.
 *
 * The counterpart to `committees/activity.ts`, read from the other end — and the cheaper end by a wide margin. Asking a
 * committee which bills it handled costs one request for the referrals plus one lookup per row to recover the titles
 * that endpoint omits; asking a bill which committees held it costs one request, and the committees arrive named,
 * chambered, and coded, which is everything an inward link needs.
 *
 * Why this is a read at all rather than something derived: the bill page already has the referral in front of it, in
 * the prose of the latest action ("Referred to the Committee on Energy and Commerce") and in the action history
 * beneath. What prose cannot give is the *system code*, and without a system code a committee is a string rather than a
 * destination. Parsing a committee's identity back out of a sentence would also be exactly the kind of inference this
 * project refuses elsewhere — @see docs/data-policy.md — when the API publishes the answer outright.
 *
 * Holds the adapter's two standing invariants: it never throws, and an unanswered request is reported as one rather
 * than as an empty collection. "No committee referral appears on this bill's record" is a sentence about
 * Congress — true of a resolution taken up directly on the floor, and false of a request that timed out — so the two
 * states reach the page distinguishable. @see BillSubResource.
 *
 * @see sub-resource.ts for the transport, guard, and caching policy this shares with `/summaries` and `/text`.
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
