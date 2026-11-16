import type { Metadata } from "next";
import type { JSX } from "react";

import { MEMBERS_METADATA, renderMembersRoute } from "@/app/members/render";
import type { RouteSearchParams } from "@/lib/search-params";

/** The same metadata as `/members`, canonical path included. */
export const metadata: Metadata = MEMBERS_METADATA;

/** Params for the query-carrying twin of `/members`. */
type QueryMembersPageProps = {
  /** The query string, read only by this on-demand twin. */
  searchParams: Promise<RouteSearchParams>;
};

/**
 * `/members` with a directory view in its query, reached only through a rewrite.
 *
 * @param props - {@link QueryMembersPageProps}.
 * @returns The directory page, narrowed to whatever the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryMembersPage({ searchParams }: QueryMembersPageProps): Promise<JSX.Element> {
  return renderMembersRoute(searchParams);
}
