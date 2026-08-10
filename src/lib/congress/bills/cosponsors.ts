import { type BillCosponsor, type BillRouteParams, billIdentityKey } from "@/lib/congress/bills/model";
import { fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiCosponsor,
  type CongressApiCosponsorsResponse,
  congressApiCosponsorsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { previewCosponsors } from "@/lib/congress/upstream/fixtures";
import { getCongressApiKey } from "@/lib/congress/upstream/http";
import { mapBillCosponsor } from "@/lib/congress/upstream/mappers";

/**
 * Who put their name to a bill they did not introduce.
 *
 * The read that keeps cosponsorship navigable in both directions. A member's page lists the bills they cosponsored, and
 * this is the other end of the same relationship: names rather than a bare count, each carrying a Bioguide ID, which
 * makes the return trip a link rather than a search.
 *
 * **The publisher's order is chronological and is kept.** Congress.gov returns cosponsors oldest first — the members
 * who signed at introduction, then everyone who joined afterwards, in the order they did. That order is the bill
 * gathering support over time, which is the most interesting thing this collection has to say, and `dateKey` is
 * deliberately omitted so nothing re-sorts it into an alphabetical list that would throw the sequence away. It is the
 * same rule `committees.ts` follows for primary jurisdiction, applied to a different fact carried by position.
 *
 * What this deliberately does not do is judge. A cosponsor count is not a measure of a bill's merit, its odds, or a
 * member's effectiveness, and neither the model nor the page ranks, scores, or aggregates on it.
 * @see docs/data-policy.md
 *
 * Holds the adapter's two standing invariants: it never throws, and the empty array it returns on failure is one the
 * page renders in the same words it uses for a bill nobody cosponsored — which is an ordinary state, and the state of
 * every bill introduced in the last few minutes. Where the difference matters, the published count says so: the bill's
 * own record carries the tally, so a page showing no names beside a count of forty states the gap rather than implying
 * the record is empty. @see BillCosponsorTally
 *
 * @see sub-resource.ts for the transport, guard, and caching policy this shares with `/summaries` and `/text`.
 */

/**
 * Fetches the members currently signed on to a bill.
 *
 * @param input - The bill's route params.
 * @returns The cosponsors in Congress.gov's own chronological order, original cosponsors first. Without a key, the
 *   labeled preview cosponsors for that fixture — or an empty list for a fixture that has none. Empty on a 404 and on
 *   failure.
 */
export async function getBillCosponsors(input: BillRouteParams): Promise<BillCosponsor[]> {
  // Mirrors `getBillSummaries`: the no-key path serves the labeled fixture rather than nothing, so the static demo
  // shows this section working instead of showing its empty state. What it must not do is let the *count* sentence
  // credit Congress.gov for a fictional bill — the section drops the published figure in preview mode instead.
  // @see previewCosponsors, and CosponsorList.
  if (!getCongressApiKey()) return previewCosponsors[billIdentityKey(input)] ?? [];

  return fetchBillSubResource(input, {
    path: "cosponsors",
    schema: congressApiCosponsorsResponseSchema,
    select: (payload: CongressApiCosponsorsResponse): CongressApiCosponsor[] | undefined => payload.cosponsors,
    map: mapBillCosponsor,
  });
}
