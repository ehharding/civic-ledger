import type { Metadata } from "next";
import type { JSX } from "react";

import { COMMITTEES_METADATA, renderCommitteesRoute } from "@/app/committees/render";
import type { RouteSearchParams } from "@/lib/search-params";

/** The same metadata as `/committees`, canonical path included. */
export const metadata: Metadata = COMMITTEES_METADATA;

/** Params for the query-carrying twin of `/committees`. */
type QueryCommitteesPageProps = {
  /** The query string, read only by this on-demand twin. */
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/committees` with a directory view in its query, reached only through a rewrite.
 *
 * @param searchParams - The requested view. Reading it is what makes this render on demand.
 * @returns The directory page, narrowed to whatever the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryCommitteesPage({ searchParams }: QueryCommitteesPageProps): Promise<JSX.Element> {
  return renderCommitteesRoute(searchParams);
}
