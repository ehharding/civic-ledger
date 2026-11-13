import type { Metadata } from "next";
import type { JSX } from "react";

import { BILLS_METADATA, renderBillsRoute } from "@/app/bills/render";
import type { RouteSearchParams } from "@/lib/search-params";

export const metadata: Metadata = BILLS_METADATA;

/** Params for the query-carrying twin of `/bills`. */
type QueryBillsPageProps = {
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/bills` with a `?q=` or `?stage=` deep link, reached only through a rewrite. @see src/lib/query-routes.ts.
 *
 * @param searchParams - The deep link. Reading it is what makes this render on demand.
 * @returns The directory page, narrowed to whatever the URL asked for.
 */
export default function QueryBillsPage({ searchParams }: QueryBillsPageProps): Promise<JSX.Element> {
  return renderBillsRoute(searchParams);
}
