import type { Metadata } from "next";
import type { JSX } from "react";

import { BILLS_METADATA, renderBillsRoute } from "@/app/bills/render";
import type { RouteSearchParams } from "@/lib/search-params";

/** The same metadata as `/bills`, canonical path included. */
export const metadata: Metadata = BILLS_METADATA;

/** Params for the query-carrying twin of `/bills`. */
type QueryBillsPageProps = {
  /** The query string, read only by this on-demand twin. */
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/bills` with a `?q=` or `?stage=` deep link, reached only through a rewrite.
 *
 * @param searchParams - The deep link. Reading it is what makes this render on demand.
 * @returns The directory page, narrowed to whatever the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryBillsPage({ searchParams }: QueryBillsPageProps): Promise<JSX.Element> {
  return renderBillsRoute(searchParams);
}
