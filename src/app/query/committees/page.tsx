import type { Metadata } from "next";
import type { JSX } from "react";

import { COMMITTEES_METADATA, renderCommitteesRoute } from "@/app/committees/render";
import type { RouteSearchParams } from "@/lib/search-params";

export const metadata: Metadata = COMMITTEES_METADATA;

/** Params for the query-carrying twin of `/committees`. */
type QueryCommitteesPageProps = {
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/committees` with a directory view in its query, reached only through a rewrite. @see src/lib/query-routes.ts.
 *
 * @param searchParams - The requested view. Reading it is what makes this render on demand.
 * @returns The directory page, narrowed to whatever the URL asked for.
 */
export default function QueryCommitteesPage({ searchParams }: QueryCommitteesPageProps): Promise<JSX.Element> {
  return renderCommitteesRoute(searchParams);
}
