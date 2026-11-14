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
 * The *longest* this route segment is cached: one day, the concluded-Congress window.
 *
 * A ceiling rather than the window itself. A route is regenerated on the shortest of its segment `revalidate` and every
 * fetch it makes, and the bill-list request for the Congress now sitting carries the shared five-minute window — so
 * `/bills/119` is still refreshed every five minutes, while `/bills/118`, whose record is closed, is refreshed daily.
 * The ceiling is what bounds a page whose fetch never ran (preview data, or an outage) to a day instead of forever.
 * @see revalidateSecondsForCongress, and CONCLUDED_CONGRESS_REVALIDATE_SECONDS, which `revalidate.test.ts` holds this
 * literal to.
 *
 * This route never reads its query, so each Congress's directory is rendered once per window rather than once per
 * visit; a URL carrying `?q=` or `?stage=` is rewritten to `/query/bills/[congress]` instead.
 * @see src/lib/query-routes.ts.
 */
export const revalidate: number = 86_400;

/** Params for the per-Congress bill directory route (`/bills/[congress]`). */
type CongressBillsPageProps = {
  params: CongressBillsParams;
};

/**
 * Pre-renders one bill-directory page per Congress the preview fixtures actually cover.
 *
 * In the default server build this is only a performance win — any other supported Congress is rendered on its first
 * visit and then cached like these. In a static export (`STATIC_EXPORT=true`, no API key) these are the *only*
 * Congress-scoped directory pages that can exist, since there's no server left to look anything else up at request
 * time.
 *
 * @returns One params object per Congress covered by the fixtures, de-duplicated.
 */
export function generateStaticParams(): { congress: string }[] {
  const congresses: number[] = Array.from(new Set(previewBills.map((bill: LegislativeBill): number => bill.congress)));
  return congresses.map((congress: number): { congress: string } => ({ congress: String(congress) }));
}

/**
 * @param params - The route's `congress` param.
 * @returns The per-Congress metadata. @see congressBillsMetadata
 */
export function generateMetadata({ params }: CongressBillsPageProps): Promise<Metadata> {
  return congressBillsMetadata(params);
}

/**
 * Bill directory for one specific Congress, in its default view.
 *
 * @param params - The route's `congress` param.
 * @returns The unfiltered directory page for that Congress. @see renderCongressBillsRoute
 */
export default function CongressBillsPage({ params }: CongressBillsPageProps): Promise<JSX.Element> {
  return renderCongressBillsRoute(params, NO_SEARCH_PARAMS);
}
