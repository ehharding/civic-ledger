import type { Metadata } from "next";
import type { JSX } from "react";

import { BILLS_METADATA, renderBillsRoute } from "@/app/bills/render";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/**
 * The route segment's data-cache window, declared as on `/members` and `/committees` so all three directories state the
 * same thing about themselves. This route never reads its query, so it is prerendered and regenerated at most once per
 * window — one render serves every visitor. A URL carrying `?q=` or `?stage=` is rewritten to `/query/bills` instead,
 * which renders on demand.
 *
 * @see src/lib/query-routes.ts
 */
export const revalidate: number = 300;

/** Shared with the `/query/bills` twin, so both name `/bills` as the canonical page. */
export const metadata: Metadata = BILLS_METADATA;

/**
 * Bill directory route for the current Congress, in its default view.
 *
 * @returns The unfiltered directory page.
 * @see renderBillsRoute
 */
export default function BillsPage(): Promise<JSX.Element> {
  return renderBillsRoute(NO_SEARCH_PARAMS, "/bills");
}
