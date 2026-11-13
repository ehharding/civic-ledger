import type { Metadata } from "next";
import type { JSX } from "react";

import { MEMBERS_METADATA, renderMembersRoute } from "@/app/members/render";
import type { RouteSearchParams } from "@/lib/search-params";

export const metadata: Metadata = MEMBERS_METADATA;

/** Params for the query-carrying twin of `/members`. */
type QueryMembersPageProps = {
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/members` with a directory view in its query, reached only through a rewrite. @see src/lib/query-routes.ts.
 *
 * @param searchParams - The requested view. Reading it is what makes this render on demand.
 * @returns The directory page, narrowed to whatever the URL asked for.
 */
export default function QueryMembersPage({ searchParams }: QueryMembersPageProps): Promise<JSX.Element> {
  return renderMembersRoute(searchParams);
}
