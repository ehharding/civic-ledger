import { type BillCosponsor, type BillRouteParams, billIdentityKey } from "@/lib/congress/bills/model";
import { type BillSubResource, fetchBillSubResource } from "@/lib/congress/bills/sub-resource";
import {
  type CongressApiCosponsor,
  type CongressApiCosponsorsResponse,
  congressApiCosponsorsResponseSchema,
} from "@/lib/congress/upstream/api-schema";
import { previewCosponsors } from "@/lib/congress/upstream/fixtures";
import { getCongressApiKey } from "@/lib/congress/upstream/http";
import { mapBillCosponsor } from "@/lib/congress/upstream/mappers";

/**
 * Who put their name to a bill they did not introduce, each linkable by Bioguide ID.
 *
 * The publisher's chronological order (originals first, then joiners in sequence) is kept — `dateKey` is omitted so
 * nothing re-sorts it. Cosponsorship is never ranked or scored. @see docs/data-policy.md
 *
 * Never throws, and a failed request is reported as unanswered rather than as "no cosponsors". @see BillSubResource,
 * BillCosponsorTally, and sub-resource.ts for the shared transport and caching.
 */

/**
 * Fetches the members currently signed on to a bill.
 *
 * @param input - The bill's route params.
 * @returns The cosponsors in Congress.gov's own chronological order, original cosponsors first. Without a key, the
 *   labeled preview cosponsors for that fixture — or an empty list for a fixture that has none. Empty and answered on a
 *   404; empty and flagged unavailable on failure.
 */
export async function getBillCosponsors(input: BillRouteParams): Promise<BillSubResource<BillCosponsor>> {
  // Mirrors `getBillSummaries`: the no-key path serves the labeled fixture rather than nothing, so the static demo
  // shows this section working instead of showing its empty state. What it must not do is let the *count* sentence
  // credit Congress.gov for a fictional bill — the section drops the published figure in preview mode instead.
  // @see previewCosponsors, and CosponsorList.
  if (!getCongressApiKey()) {
    return { entries: previewCosponsors[billIdentityKey(input)] ?? [], unavailable: false };
  }

  return fetchBillSubResource(input, {
    path: "cosponsors",
    schema: congressApiCosponsorsResponseSchema,
    select: (payload: CongressApiCosponsorsResponse): CongressApiCosponsor[] | undefined => payload.cosponsors,
    map: mapBillCosponsor,
  });
}
