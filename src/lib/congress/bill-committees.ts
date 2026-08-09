import {
  type CongressApiBillCommittee,
  type CongressApiBillCommitteesResponse,
  congressApiBillCommitteesResponseSchema,
} from "@/lib/congress/api-schema";
import { fetchBillSubResource } from "@/lib/congress/bill-sub-resource";
import type { BillCommittee } from "@/lib/congress/committees";
import { mapBillCommittee } from "@/lib/congress/mappers";
import type { BillRouteParams } from "@/lib/congress/types";

/**
 * Which committees held a bill, and what each of them did with it.
 *
 * The counterpart to `committee-activity.ts`, read from the other end — and the cheaper end by a wide margin. Asking a
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
 * Holds the adapter's two standing invariants: it never throws, and the empty array it returns on failure is one the
 * page renders as "none on the record" in the same words it uses for a bill that genuinely has none. That conflation is
 * acceptable here and is not elsewhere: a committee referral is not a claim about the whole record the way a
 * collection's *count* is, and the bill's own action history — fetched alongside, and shown on the same page — carries
 * the referral in prose whenever it happened.
 *
 * @see bill-sub-resource.ts for the transport, guard, and caching policy this shares with `/summaries` and `/text`.
 */

/**
 * Fetches every committee a bill was referred to, reported by, or otherwise handled by.
 *
 * @param input - The bill's route params.
 * @returns The committees in Congress.gov's own order — primary committee first, which is meaningful and which this app
 *   therefore does not re-sort. Always empty in preview mode, on a 404, and on failure.
 */
export async function getBillCommittees(input: BillRouteParams): Promise<BillCommittee[]> {
  return fetchBillSubResource(input, {
    path: "committees",
    schema: congressApiBillCommitteesResponseSchema,
    select: (payload: CongressApiBillCommitteesResponse): CongressApiBillCommittee[] | undefined => payload.committees,
    map: mapBillCommittee,
  });
}
