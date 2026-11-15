import type { Metadata } from "next";
import type { JSX } from "react";

import {
  type CongressBillsParams,
  congressBillsMetadata,
  renderCongressBillsRoute,
} from "@/app/bills/[congress]/render";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { previewBills } from "@/lib/congress/upstream/fixtures";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/**
 * The *longest* this route is cached: one day. The current Congress's list fetch shortens that to five minutes; the
 * ceiling bounds a page whose fetch never ran. `revalidate.test.ts` holds this literal to
 * `CONCLUDED_CONGRESS_REVALIDATE_SECONDS`.
 *
 * This route never reads its query; `?q=` or `?stage=` URLs are rewritten to `/query/bills/[congress]`.
 *
 * @see src/lib/query-routes.ts
 */
export const revalidate: number = 86_400;

/** Params for the per-Congress bill directory route (`/bills/[congress]`). */
type CongressBillsPageProps = {
  params: CongressBillsParams;
};

/**
 * Pre-renders one directory page per Congress the preview fixtures cover — a performance win on a server build, and the
 * only Congress-scoped directories a static export has.
 *
 * @returns One params object per Congress covered by the fixtures, de-duplicated.
 */
export function generateStaticParams(): { congress: string }[] {
  const congresses: number[] = Array.from(new Set(previewBills.map((bill: LegislativeBill): number => bill.congress)));
  return congresses.map((congress: number): { congress: string } => ({ congress: String(congress) }));
}

/**
 * @param params - The route's `congress` param.
 * @returns The per-Congress metadata.
 * @see congressBillsMetadata
 */
export function generateMetadata({ params }: CongressBillsPageProps): Promise<Metadata> {
  return congressBillsMetadata(params);
}

/**
 * Bill directory for one specific Congress, in its default view.
 *
 * @param params - The route's `congress` param.
 * @returns The unfiltered directory page for that Congress.
 * @see renderCongressBillsRoute
 */
export default function CongressBillsPage({ params }: CongressBillsPageProps): Promise<JSX.Element> {
  return renderCongressBillsRoute(params, NO_SEARCH_PARAMS);
}
